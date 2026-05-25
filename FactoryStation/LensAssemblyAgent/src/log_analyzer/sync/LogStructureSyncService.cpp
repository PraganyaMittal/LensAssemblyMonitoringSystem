#include "log_analyzer/sync/LogStructureSyncService.h"
#include "network/RestClient.h"
#include "utilities/FileUtils.h"
#include "common/Constants.h"
#include <sstream>
#include <iomanip>
#include <string_view>
#include <algorithm>
#include "core/Logger.h"

namespace fs = std::filesystem;

static bool IsValidLogStructureEntry(const fs::path& entryPath, const fs::path& rootPath) {
    fs::path relPath = fs::relative(entryPath, rootPath);
    std::vector<std::string> parts;
    for (auto it = relPath.begin(); it != relPath.end(); ++it) {
        parts.push_back(it->string());
    }

    int depth = static_cast<int>(parts.size());
    
    if (depth >= 1) {
        const auto& yearStr = parts[0];
        if (yearStr.length() != 4) return false;
        try {
            int year = std::stoi(yearStr);
            if (year < 1000 || year > 9999) return false;
        } catch (...) { return false; }
    }
    
    if (depth >= 2) {
        const auto& monthStr = parts[1];
        if (monthStr.length() != 2) return false;
        try {
            int month = std::stoi(monthStr);
            if (month < 1 || month > 12) return false;
        } catch (...) { return false; }
    }
    
    if (depth >= 3) {
        const auto& dateStr = parts[2];
        if (dateStr.length() != 2) return false;
        try {
            int year = std::stoi(parts[0]);
            int month = std::stoi(parts[1]);
            int day = std::stoi(dateStr);
            if (day < 1 || day > 31) return false;

            int daysInMonth[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            if (month == 2) {
                bool isLeap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
                if (isLeap) daysInMonth[1] = 29;
            }
            if (day > daysInMonth[month - 1]) return false;
        } catch (...) { return false; }
    }
    
    if (depth == 4 && fs::is_directory(entryPath)) return false;
    if (depth > 4) return false;
    if (depth < 4 && !fs::is_directory(entryPath)) return false;
    return true;
}

LogStructureSyncService::LogStructureSyncService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}

LogStructureSyncService::~LogStructureSyncService() {
    Stop();
}

void LogStructureSyncService::Start() {
    if (syncThread_.joinable()) return;  
    syncThread_ = std::jthread([this](std::stop_token stoken) {
        SyncWorkerLoop(stoken);
    });
}

void LogStructureSyncService::Stop() {
    syncThread_.request_stop();
    syncCv_.notify_all();
    if (syncThread_.joinable()) {
        syncThread_.join();
    }
}

void LogStructureSyncService::SyncWorkerLoop(std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        {
            std::unique_lock<std::mutex> lock(syncMutex_);
            syncCv_.wait_for(lock, std::chrono::seconds(60), [this, &stoken]() {
                return syncRequested_.load() || stoken.stop_requested();
            });
        }

        if (stoken.stop_requested()) break;
        
        syncRequested_.store(false);
        UploadDirectoryTree();
    }
}

void LogStructureSyncService::RequestStructureSync() {
    // Debounce: coalesce bursts of rapid events (e.g. Year/Month/Day folders
    // created in quick succession). 500ms window is safe for LAI's pattern.
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        now - lastRequestTime_);
    if (elapsed.count() < 500) {
        return;
    }
    lastRequestTime_ = now;
    syncRequested_.store(true);
    syncCv_.notify_one();
}


json LogStructureSyncService::BuildDirectoryTree(const fs::path& currentPath, const fs::path& rootPath) {
    json children = json::array();

    if (!fs::exists(currentPath) || !fs::is_directory(currentPath)) {
        return children;
    }

    try {
        for (const auto& entry : fs::directory_iterator(currentPath)) {
            try {
                if (!IsValidLogStructureEntry(entry.path(), rootPath)) {
                    continue;
                }
                json node = json::object();

                node["name"] = entry.path().filename().string();
                node["path"] = fs::relative(entry.path(), rootPath).string();
                node["isDirectory"] = entry.is_directory();

                if (entry.is_regular_file()) {
                    node["size"] = entry.file_size();
                }
                else if (entry.is_directory()) {
                    node["children"] = BuildDirectoryTree(entry.path(), rootPath);
                }

                children.push_back(node);
            }
            catch (const std::exception& e) {
                Logger::Warning("[LogStructureSyncService] Skipping entry: " + std::string(e.what()));
                continue;
            }
        }
    }
    catch (const fs::filesystem_error& e) {
        Logger::Warning("[LogStructureSyncService] Cannot iterate directory: " + std::string(e.what()));
    }

    
    std::sort(children.begin(), children.end(), [](const json& a, const json& b) {
        return a["name"].get<std::string>() < b["name"].get<std::string>();
    });

    return children;
}

void LogStructureSyncService::UploadDirectoryTree() {
    
    if (!settings_ || settings_->logFolderPath.empty() || settings_->mcId <= 0) {
        return;
    }

    
    if (!httpClient_) {
        Logger::Warning("[LogStructureSyncService] HTTP client not available, skipping sync.");
        return;
    }

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
            Logger::Info("[LogStructureSyncService] Structure synced successfully.");
        }
    }
    catch (const std::exception& e) {
        Logger::Warning("[LogStructureSyncService] Failed to sync: " + std::string(e.what()));
    }
}
