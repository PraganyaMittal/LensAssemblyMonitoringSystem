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
#include "core/Logger.h"

namespace fs = std::filesystem;



LogFileUploadService::LogFileUploadService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}



void LogFileUploadService::UploadRequestedFile(const std::string& filePath, const std::string& requestId) {
    std::string fullPath = settings_->logFolderPath + "\\" + filePath;
    
    if (!fs::exists(fullPath)) {
        return;
    }

    size_t lastSlash = fullPath.find_last_of("\\/");
    std::string fileName = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;

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
    Logger::Error("[LogFileUploadService] Filtered upload failed for " + fullPath + " — aborting (no full-file fallback)");
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

        
        
        int tabCount = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                tabCount++;
                if (tabCount >= 10) break;  
            }
        }
        if (tabCount < 10) continue;

        
        
        int currentTab = 0;
        size_t col9Start = 0;
        size_t col9End = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                currentTab++;
                if (currentTab == 9) {
                    col9Start = i + 1;
                } else if (currentTab == 10) {
                    col9End = i;
                    break;
                }
            }
        }
        if (col9End <= col9Start) continue;

        
        size_t eventLen = col9End - col9Start;
        const char* eventPtr = lineData + col9Start;

        bool isRelevantEvent = false;
        if (eventLen == 5 && std::memcmp(eventPtr, "START", 5) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 3 && std::memcmp(eventPtr, "END", 3) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 2 && std::memcmp(eventPtr, "NG", 2) == 0) {
            isRelevantEvent = true;
        }
        if (!isRelevantEvent) continue;

        
        
        
        size_t col10Start = col9End + 1;
        if (col10Start >= lineLen) continue;

        
        std::string_view remainder(lineData + col10Start, lineLen - col10Start);
        if (remainder.find("barrelId") == std::string_view::npos) continue;

        
        filteredContent.append(lineData, lineLen);
        filteredContent.push_back('\n');
        keptLines++;
    }
    file.close();

    Logger::Info("[LogFileUploadService] Filtered " + fullPath + ": " +
        std::to_string(keptLines) + "/" + std::to_string(totalLines) + " lines kept (" +
        std::to_string(filteredContent.size() / 1024) + " KB)");

    if (filteredContent.empty()) {
        
        
        filteredContent = "";
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
