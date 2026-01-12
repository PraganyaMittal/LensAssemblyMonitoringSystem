#include "../include/services/LogService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/FileUtils.h"
#include "../include/utilities/GzipCompressor.h"
#include "../include/common/Constants.h"
#include <windows.h>
#include <filesystem>
#include <sstream>
#include <iomanip>

namespace fs = std::filesystem;

LogService::LogService(AgentSettings* settings, HttpClient* client) {
    settings_ = settings;
    httpClient_ = client;
    lastSyncedStructure_ = "";
    syncSpreadApplied_ = false;
}

LogService::~LogService() {
}

std::string LogService::FormatTime(fs::file_time_type ftime) {
    try {
        auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
            ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now()
        );
        std::time_t cftime = std::chrono::system_clock::to_time_t(sctp);

        std::stringstream ss;
        struct tm timeinfo;
        localtime_s(&timeinfo, &cftime);
        ss << std::put_time(&timeinfo, "%Y-%m-%d %H:%M:%S");
        return ss.str();
    }
    catch (...) {
        return "2000-01-01 00:00:00";
    }
}

json LogService::BuildDirectoryTree(const fs::path& currentPath, const fs::path& rootPath) {
    json children = json::array();

    if (!fs::exists(currentPath) || !fs::is_directory(currentPath)) {
        return children;
    }

    for (const auto& entry : fs::directory_iterator(currentPath)) {
        try {
            json node;

            node["name"] = entry.path().filename().string();
            node["path"] = fs::relative(entry.path(), rootPath).string();
            node["isDirectory"] = entry.is_directory();

            if (entry.is_regular_file()) {
                node["size"] = entry.file_size();
                node["modifiedDate"] = FormatTime(fs::last_write_time(entry));
            }
            else if (entry.is_directory()) {
                node["children"] = BuildDirectoryTree(entry.path(), rootPath);
            }

            children.push_back(node);
        }
        catch (const std::exception&) {
            continue;
        }
    }
    return children;
}

void LogService::SyncLogsToServer() {
    if (!FileUtils::FolderExists(settings_->logFolderPath)) {
        return;
    }

    try {
        fs::path rootPath(settings_->logFolderPath);
        json fileTree = BuildDirectoryTree(rootPath, rootPath);

        std::string currentStructureJson = fileTree.dump();
        if (currentStructureJson == lastSyncedStructure_) {
            return;
        }

        // Apply hierarchy-based spread delay to prevent thundering herd
        // Only apply once per structure change (new log file detected)
        if (!syncSpreadApplied_) {
            int spreadDelayMs = CalculateSyncSpreadDelay();
            Sleep(spreadDelayMs);
            syncSpreadApplied_ = true;
        }

        json request;
        request["pcId"] = settings_->pcId;
        request["logStructureJson"] = currentStructureJson;

        json response;
        if (httpClient_->Post(AgentConstants::ENDPOINT_SYNC_LOGS, request, response)) {
            lastSyncedStructure_ = currentStructureJson;
            syncSpreadApplied_ = false;  // Reset for next structure change
        }
    }
    catch (const std::exception&) {
        // Silent fail - log sync is non-critical
    }
}

int LogService::CalculateSyncSpreadDelay() {
    // 20-second window spread based on Version -> Line -> PC hierarchy
    // Derived from Total Spread Time / Number of Versions
    
    // Calculate per-version window (assuming 2 versions: 3.x and 4.x)
    const int VERSION_WINDOW_MS = AgentConstants::SYNC_SPREAD_TOTAL_DURATION_MS / 2;
    const int MAX_LINES = 28;             // Max lines per version
    const int MAX_PCS = 10;               // Max PCs per line
    
    // Version determines which half of 20-second window (0-10s or 10-20s)
    int versionOffset = 0;
    if (!settings_->modelVersion.empty() && settings_->modelVersion[0] == '4') {
        versionOffset = VERSION_WINDOW_MS;  // Version 4.x starts at 10 seconds
    }
    
    // Line slot within version's 10-second window
    // 28 lines max -> 10000ms / 28 = ~357ms per line
    int msPerLine = VERSION_WINDOW_MS / MAX_LINES;
    int lineSlot = (settings_->lineNumber - 1) * msPerLine;
    
    // PC slot within line's window
    // 10 PCs max -> 357ms / 10 = ~35ms per PC
    int msPerPc = msPerLine / MAX_PCS;
    int pcSlot = (settings_->pcNumber - 1) * msPerPc;
    
    return versionOffset + lineSlot + pcSlot;
}

void LogService::UploadRequestedFile(const std::string& filePath, const std::string& requestId) {
    // Resolve relative path to absolute using log folder
    std::string fullPath = settings_->logFolderPath + "\\" + filePath;
    
    if (!fs::exists(fullPath)) {
        return;
    }

    // Extract filename for upload
    size_t lastSlash = fullPath.find_last_of("\\/");
    std::string fileName = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;

    json response;
    std::string pcIdStr = std::to_string(settings_->pcId);
    
    // Build endpoint with requestId if provided
    std::wstring endpoint;
    if (!requestId.empty()) {
        endpoint = L"/api/agent/uploadlog/" + std::wstring(requestId.begin(), requestId.end());
    } else {
        endpoint = AgentConstants::ENDPOINT_UPLOAD_LOG;
    }
    
    // Compress the file using GzipCompressor
    size_t originalSize = 0;
    std::vector<uint8_t> compressedData = GzipCompressor::CompressFile(fullPath, originalSize);

    if (!compressedData.empty()) {
        httpClient_->UploadCompressedData(endpoint, compressedData, fileName, pcIdStr, originalSize, response);
    } else {
        // Fallback to uncompressed upload if compression fails
        httpClient_->UploadFile(endpoint, fullPath, pcIdStr, response);
    }
}
