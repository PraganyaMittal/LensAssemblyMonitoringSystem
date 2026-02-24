#include "../include/services/LogService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/FileUtils.h"
#include "../include/utilities/NetworkUtils.h"
#include "../include/utilities/GzipCompressor.h"
#include "../include/common/Constants.h"
#include <windows.h>
#include <filesystem>
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
#include "../include/Utils/Logger.h"

namespace fs = std::filesystem;

LogService::LogService(AgentSettings* settings, HttpClient* client) {
    settings_ = settings;
    httpClient_ = client;
    lastSyncedStructure_ = "";
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

        json request;
        request["mcId"] = settings_->mcId;
        request["logStructureJson"] = currentStructureJson;

        json response;
        if (httpClient_->Post(AgentConstants::ENDPOINT_SYNC_LOGS, request, response)) {
            lastSyncedStructure_ = currentStructureJson;
        }
    }
    catch (const std::exception&) {
    }
}

void LogService::TriggerAsyncSync() {
    int lineNumber = settings_->lineNumber;
    int pcNumber = settings_->mcNumber;

    // Constrain the sync window to 60 seconds (60000 ms)
    // Formula: DelayMs = ((LineNumber - 1) * 10 + (PCNumber - 1)) * 214
    int delayMs = ((lineNumber - 1) * 10 + (pcNumber - 1)) * 214;

    if (delayMs < 0) delayMs = 0;
    if (delayMs > 60000) delayMs = 60000;

    LogService* self = this;
    std::thread([self, delayMs]() {
        if (delayMs > 0) {
            std::string msg = "Delaying log sync by " + std::to_string(delayMs) + " ms to prevent thundering herd...";
            FactoryAgent::Utils::Logger::Info(msg);
            std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));
        }
        self->SyncLogsToServer();
    }).detach();
}

void LogService::UploadRequestedFile(const std::string& filePath, const std::string& requestId) {
    std::string fullPath = settings_->logFolderPath + "\\" + filePath;
    
    if (!fs::exists(fullPath)) {
        return;
    }

    size_t lastSlash = fullPath.find_last_of("\\/");
    std::string fileName = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;

    json response;
    std::string pcIdStr = std::to_string(settings_->mcId);
    
    std::wstring endpoint;
    if (!requestId.empty()) {
        endpoint = L"/api/agent/uploadlog/" + NetworkUtils::ConvertStringToWString(requestId);
    } else {
        endpoint = AgentConstants::ENDPOINT_UPLOAD_LOG;
    }
    
    size_t originalSize = 0;
    std::vector<uint8_t> compressedData = GzipCompressor::CompressFile(fullPath, originalSize);

    if (!compressedData.empty()) {
        httpClient_->UploadCompressedData(endpoint, compressedData, fileName, pcIdStr, originalSize, response);
    } else {
        httpClient_->UploadFile(endpoint, fullPath, pcIdStr, response);
    }
}
