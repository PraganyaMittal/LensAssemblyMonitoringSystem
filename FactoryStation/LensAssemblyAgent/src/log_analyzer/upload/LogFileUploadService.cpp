#include "log_analyzer/upload/LogFileUploadService.h"
#include "network/RestClient.h"
#include "network/NetworkUtils.h"
#include "utilities/GzipCompressor.h"
#include "common/Constants.h"
#include <filesystem>
#include <fstream>
#include <cstring>
#include <memory>
#include <limits>
#include <string_view>
#include <thread>
#include <chrono>
#include <system_error>
#include "core/Logger.h"

namespace fs = std::filesystem;

namespace {
    bool HasParentTraversal(const fs::path& path) {
        for (const auto& part : path) {
            if (part == fs::path("..")) {
                return true;
            }
        }
        return false;
    }
}


LogFileUploadService::LogFileUploadService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}



void LogFileUploadService::UploadRequestedFile(const std::string& filePath, const std::string& requestId) {
    if (settings_ == nullptr || httpClient_ == nullptr) {
        Logger::Error("[LogFileUploadService] Cannot upload log: service is not initialized.");
        return;
    }

    if (settings_->logFolderPath.empty()) {
        Logger::Error("[LogFileUploadService] Cannot upload log: log folder path is empty.");
        return;
    }

    if (filePath.empty()) {
        Logger::Warning("[LogFileUploadService] Rejected empty log path.");
        return;
    }

    fs::path requestedPath(filePath);
    if (requestedPath.is_absolute() || requestedPath.has_root_name() ||
        requestedPath.has_root_directory() || HasParentTraversal(requestedPath)) {
        Logger::Warning("[LogFileUploadService] Rejected unsafe log path: " + filePath);
        return;
    }

    fs::path fullFsPath = fs::path(settings_->logFolderPath) / requestedPath;
    fullFsPath = fullFsPath.lexically_normal();
    std::string fullPath = fullFsPath.string();
    
    std::error_code ec;
    if (!fs::exists(fullFsPath, ec) || !fs::is_regular_file(fullFsPath, ec)) {
        Logger::Warning("[LogFileUploadService] Requested log file not found: " + fullPath);
        return;
    }

    std::string fileName = fullFsPath.filename().string();

    std::string pcIdStr = std::to_string(settings_->mcId);
    
    std::wstring endpoint;
    if (!requestId.empty()) {
        endpoint = L"/api/agent/uploadlog/" + NetworkUtils::ConvertStringToWString(requestId);
    } else {
        endpoint = AgentConstants::ENDPOINT_UPLOAD_LOG;
    }

    if (UploadFilteredFile(fullPath, fileName, endpoint, pcIdStr)) {
        return;
    }

    // Single retry after 1 second — covers transient network blips and prevents
    // the server-side TaskCompletionSource from timing out unnecessarily.
    Logger::Warning("[LogFileUploadService] First upload attempt failed for " + fullPath + " — retrying in 1s");
    std::this_thread::sleep_for(std::chrono::seconds(1));

    if (UploadFilteredFile(fullPath, fileName, endpoint, pcIdStr)) {
        Logger::Info("[LogFileUploadService] Retry succeeded for " + fullPath);
        return;
    }
    Logger::Error("[LogFileUploadService] Filtered upload failed after retry for " + fullPath + " — aborting");
}





bool LogFileUploadService::UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
    const std::wstring& endpoint, const std::string& pcIdStr) {
    
    
    std::ifstream file(fullPath, std::ios::in);
    if (!file.is_open()) {
        return false;
    }

    
    
    std::string filteredContent;
    filteredContent.reserve(1024 * 1024);  

    size_t totalLines = 0;
    size_t keptLines = 0;

    
    
    
    
    
    
    
    
    
    
    constexpr std::streamsize MAX_LINE_LEN = 64 * 1024;  
    auto lineBuffer = std::make_unique<char[]>(MAX_LINE_LEN);

    while (true) {
        file.getline(lineBuffer.get(), MAX_LINE_LEN);

        if (file.eof() && file.gcount() == 0) break;  

        totalLines++;

        if (file.fail() && !file.eof()) {
            
            
            file.clear();
            file.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            continue;
        }

        
        
        size_t lineLen = file.gcount() > 0 ? static_cast<size_t>(file.gcount() - 1) : 0;
        if (lineLen == 0) continue;
        const char* lineData = lineBuffer.get();

        // Minimum tab count validation — log lines must have at least 10 tabs
        int tabCount = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                tabCount++;
                if (tabCount >= 10) break;
            }
        }
        if (tabCount < 10) continue;

        // Extract Col 7 (scope) and Col 9 (event type) positions in a single pass
        int currentTab = 0;
        size_t col7Start = 0, col7End = 0;
        size_t col9Start = 0, col9End = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                currentTab++;
                if (currentTab == 7)       col7Start = i + 1;
                else if (currentTab == 8)  col7End = i;
                else if (currentTab == 9)  col9Start = i + 1;
                else if (currentTab == 10) { col9End = i; break; }
            }
        }
        if (col7End <= col7Start || col9End <= col9Start) continue;

        // Filter by scope: Col 7 must be "Seq_Log_Analyzer"
        constexpr char SEQ_SCOPE[] = "Seq_Log_Analyzer";
        constexpr size_t SEQ_SCOPE_LEN = 16;
        size_t scopeLen = col7End - col7Start;
        if (scopeLen != SEQ_SCOPE_LEN || std::memcmp(lineData + col7Start, SEQ_SCOPE, SEQ_SCOPE_LEN) != 0) continue;

        // Filter by event type: Col 9 must be START, END, or SET
        size_t eventLen = col9End - col9Start;
        const char* eventPtr = lineData + col9Start;

        bool isRelevantEvent = false;
        if (eventLen == 5 && std::memcmp(eventPtr, "START", 5) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 3 && std::memcmp(eventPtr, "END", 3) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 3 && std::memcmp(eventPtr, "SET", 3) == 0) {
            isRelevantEvent = true;
        }
        if (!isRelevantEvent) continue;

        // Line passed both scope and event type checks — keep it
        filteredContent.append(lineData, lineLen);
        filteredContent.push_back('\n');
        keptLines++;
    }
    file.close();

    Logger::Info("[LogFileUploadService] Filtered " + fullPath + ": " +
        std::to_string(keptLines) + "/" + std::to_string(totalLines) + " lines kept (" +
        std::to_string(filteredContent.size() / 1024) + " KB)");

    if (filteredContent.empty()) {
        Logger::Info("[LogFileUploadService] No relevant lines found in " + fullPath + " — uploading empty content");
    }

    
    std::vector<uint8_t> dataToCompress(filteredContent.begin(), filteredContent.end());
    size_t originalSize = filteredContent.size();

    
    filteredContent.clear();
    filteredContent.shrink_to_fit();

    std::vector<uint8_t> compressedData = GzipCompressor::CompressToGzip(dataToCompress);

    
    dataToCompress.clear();
    dataToCompress.shrink_to_fit();

    if (compressedData.empty()) {
        return false;  
    }

    json response;
    return httpClient_->UploadCompressedData(endpoint, compressedData, fileName, pcIdStr, originalSize, response);
}
