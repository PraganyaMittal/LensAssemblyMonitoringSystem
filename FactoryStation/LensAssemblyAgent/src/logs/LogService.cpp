 #include "logs/LogService.h"
#include "network/RestClient.h"
#include "utilities/FileUtils.h"
#include "network/NetworkUtils.h"
#include "utilities/GzipCompressor.h"
#include "common/Constants.h"
#include <windows.h>
#include <filesystem>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <thread>
#include <chrono>
#include "core/Logger.h"

namespace fs = std::filesystem;

static bool IsValidLogStructureEntry(const fs::path& entryPath, const fs::path& rootPath) {
    fs::path relPath = fs::relative(entryPath, rootPath);
    std::vector<std::string> parts;
    for (auto it = relPath.begin(); it != relPath.end(); ++it) {
        parts.push_back(it->string());
    }

    int depth = static_cast<int>(parts.size());
    
    int offset = 0;
    if (depth >= 1) {
        bool firstPartIsYear = false;
        if (parts[0].length() == 4) {
            try {
                int y = std::stoi(parts[0]);
                if (y >= 1000 && y <= 9999) firstPartIsYear = true;
            } catch (...) {}
        }
        offset = firstPartIsYear ? 0 : 1;
    }

    if (depth >= 1 + offset) {
        std::string yearStr = parts[0 + offset];
        if (yearStr.length() != 4) {
            Logger::Info("Rejected Depth 2 (Year Length != 4): " + relPath.string());
            return false;
        }
        try {
            int year = std::stoi(yearStr);
            if (year < 1000 || year > 9999) {
                Logger::Info("Rejected Depth 2 (Year Bounds): " + relPath.string());
                return false;
            }
        } catch (...) { 
            Logger::Info("Rejected Depth 2 (Year Parse Error): " + relPath.string());
            return false; 
        }
    }

    if (depth >= 2 + offset) {
        std::string monthStr = parts[1 + offset];
        if (monthStr.length() != 2) {
            Logger::Info("Rejected Depth 3 (Month Length != 2): " + relPath.string());
            return false;
        }
        try {
            int month = std::stoi(monthStr);
            if (month < 1 || month > 12) {
                Logger::Info("Rejected Depth 3 (Month Bounds): " + relPath.string());
                return false;
            }
        } catch (...) { 
            Logger::Info("Rejected Depth 3 (Month Parse Error): " + relPath.string());
            return false; 
        }
    }

    if (depth >= 3 + offset) {
        std::string dateStr = parts[2 + offset];
        if (dateStr.length() != 2) {
            Logger::Info("Rejected Depth 4 (Date Length != 2): " + relPath.string());
            return false;
        }
        try {
            int year = std::stoi(parts[0 + offset]);
            int month = std::stoi(parts[1 + offset]);
            int day = std::stoi(dateStr);
            
            if (day < 1 || day > 31) {
                Logger::Info("Rejected Depth 4 (Date Bounds): " + relPath.string());
                return false;
            }
            
            int daysInMonth[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            if (month == 2) {
                bool isLeap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
                if (isLeap) daysInMonth[1] = 29;
            }
            if (day > daysInMonth[month - 1]) {
                Logger::Info("Rejected Depth 4 (Date Cal Bounds): " + relPath.string());
                return false;
            }
        } catch (...) { 
            Logger::Info("Rejected Depth 4 (Date Parse Error): " + relPath.string());
            return false; 
        }
    }

    
    if (depth == 4 + offset) {
        if (fs::is_directory(entryPath)) {
            Logger::Info("Rejected Depth 5 (Directory Instead of File): " + relPath.string());
            return false; 
        }
    }
    
    
    if (depth > 4 + offset) {
        Logger::Info("Rejected (Too Deep): " + relPath.string());
        return false;
    }

    
    if (depth < 4 + offset && !fs::is_directory(entryPath)) {
        Logger::Info("Rejected (File Too Shallow): " + relPath.string());
        return false;
    }

    return true;
}

LogService::LogService(AgentSettings* settings, RestClient* client) {
    settings_ = settings;
    httpClient_ = client;
    lastSyncedStructure_ = "";
}

LogService::~LogService() {
    Stop();
}

void LogService::Start() {
    if (syncThread_.joinable()) return;  // Already running
    syncThread_ = std::jthread([this](std::stop_token stoken) {
        SyncWorkerLoop(stoken);
    });
}

void LogService::Stop() {
    syncThread_.request_stop();
    syncCv_.notify_all();
    if (syncThread_.joinable()) {
        syncThread_.join();
    }
}

void LogService::SyncWorkerLoop(std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        {
            std::unique_lock<std::mutex> lock(syncMutex_);
            syncCv_.wait_for(lock, std::chrono::seconds(60), [this, &stoken]() {
                return syncRequested_.load() || stoken.stop_requested();
            });
        }

        if (stoken.stop_requested()) break;

        if (syncRequested_.load()) {
            syncRequested_.store(false);

            // Thundering-herd delay: stagger sync requests across factory PCs
            // to avoid 100+ agents DDOSing the backend simultaneously.
            int lineNumber = settings_->lineNumber;
            int pcNumber = settings_->mcNumber;
            int delayMs = ((lineNumber - 1) * 10 + (pcNumber - 1)) * 214;
            if (delayMs < 0) delayMs = 0;
            if (delayMs > 60000) delayMs = 60000;

            if (delayMs > 0) {
                Logger::Info("Delaying log sync by " + std::to_string(delayMs) + " ms to prevent thundering herd...");
                
                // D8 fix: interruptible delay using condition_variable.
                // Old code used sleep_for(100ms) loop which blocked shutdown for up to 60s.
                // This exits IMMEDIATELY when stop is requested.
                std::unique_lock<std::mutex> lock(syncMutex_);
                if (syncCv_.wait_for(lock, std::chrono::milliseconds(delayMs), [&stoken]() {
                    return stoken.stop_requested();
                })) {
                    break;  // Stop was requested during delay
                }
            }

            if (!stoken.stop_requested()) {
                SyncLogsToServer();
            }
        }
    }
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
            if (!IsValidLogStructureEntry(entry.path(), rootPath)) {
                continue;
            }
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
        catch (const std::exception& e) {
            Logger::Warning("[LogService] Skipping entry in directory tree: " + std::string(e.what()));
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
    catch (const std::exception& e) {
        Logger::Warning("[LogService] Failed to sync logs to server: " + std::string(e.what()));
    }
}

void LogService::TriggerAsyncSync() {
    syncRequested_.store(true);
    syncCv_.notify_one();
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

    // Filtered upload: reads line-by-line (no 50MB allocation),
    // keeps only lines relevant for analysis graphs (~500KB from 40-50MB),
    // compresses via GZip, and uploads. This is the ONLY upload path.
    if (UploadFilteredFile(fullPath, fileName, endpoint, pcIdStr)) {
        return;
    }
    Logger::Error("[LogService] Filtered upload failed for " + fullPath + " — aborting (no full-file fallback)");
}

bool LogService::UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
    const std::wstring& endpoint, const std::string& pcIdStr) {
    
    // Open the file as a text stream — NO full-file allocation.
    // We read line-by-line using std::getline's internal buffer (~4-8KB).
    std::ifstream file(fullPath, std::ios::in);
    if (!file.is_open()) {
        return false;
    }

    // The filtered output buffer. For a typical 40-50MB log file,
    // only ~0.5-2% of lines match, so this will be ~200KB-1MB.
    std::string filteredContent;
    filteredContent.reserve(1024 * 1024);  // Pre-allocate 1MB to avoid reallocs

    std::string line;
    size_t totalLines = 0;
    size_t keptLines = 0;

    while (std::getline(file, line)) {
        totalLines++;

        // Fast rejection: lines with < 11 tab-separated columns are irrelevant.
        // Count tabs without splitting — much cheaper than a full split.
        int tabCount = 0;
        for (char c : line) {
            if (c == '\t') {
                tabCount++;
                if (tabCount >= 10) break;  // We need at least 11 columns (10 tabs)
            }
        }
        if (tabCount < 10) continue;

        // Extract column 9 (event) — the 10th tab-separated field (0-indexed = 9).
        // Walk through tabs to find the start/end of column 9.
        int currentTab = 0;
        size_t col9Start = 0;
        size_t col9End = 0;
        for (size_t i = 0; i < line.size(); i++) {
            if (line[i] == '\t') {
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

        // Check if event is START, END, or NG — these are the only events the UI parser uses.
        size_t eventLen = col9End - col9Start;
        const char* eventPtr = line.c_str() + col9Start;

        bool isRelevantEvent = false;
        if (eventLen == 5 && std::memcmp(eventPtr, "START", 5) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 3 && std::memcmp(eventPtr, "END", 3) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 2 && std::memcmp(eventPtr, "NG", 2) == 0) {
            isRelevantEvent = true;
        }
        if (!isRelevantEvent) continue;

        // Check if column 10 (JSON payload) contains "barrelId".
        // The UI parser skips any line where barrelId is missing from the JSON.
        // We do a simple substring search — no JSON parsing needed.
        size_t col10Start = col9End + 1;
        if (col10Start >= line.size()) continue;

        // Use std::string::find on the remaining portion for "barrelId"
        if (line.find("barrelId", col10Start) == std::string::npos) continue;

        // This line passed all 3 checks — keep it.
        filteredContent.append(line);
        filteredContent.push_back('\n');
        keptLines++;
    }
    file.close();

    Logger::Info("[LogService] Filtered " + fullPath + ": " +
        std::to_string(keptLines) + "/" + std::to_string(totalLines) + " lines kept (" +
        std::to_string(filteredContent.size() / 1024) + " KB)");

    if (filteredContent.empty()) {
        // No relevant lines found — this is valid (empty log file or no barrel data yet).
        // Send an empty content so the UI shows "no data" properly.
        filteredContent = "";
    }

    // Compress the filtered content (typically ~500KB → ~50KB)
    std::vector<uint8_t> dataToCompress(filteredContent.begin(), filteredContent.end());
    size_t originalSize = filteredContent.size();

    // Free the filteredContent memory before compression to minimize peak RAM
    filteredContent.clear();
    filteredContent.shrink_to_fit();

    std::vector<uint8_t> compressedData = GzipCompressor::CompressToGzip(dataToCompress);

    // Free uncompressed data immediately
    dataToCompress.clear();
    dataToCompress.shrink_to_fit();

    if (compressedData.empty()) {
        return false;  // Compression failed, caller will fall back to full upload
    }

    json response;
    return httpClient_->UploadCompressedData(endpoint, compressedData, fileName, pcIdStr, originalSize, response);
}
