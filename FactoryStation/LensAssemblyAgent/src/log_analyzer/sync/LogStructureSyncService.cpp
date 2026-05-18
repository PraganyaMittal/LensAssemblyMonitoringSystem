#include "log_analyzer/sync/LogStructureSyncService.h"
#include "network/RestClient.h"
#include "utilities/FileUtils.h"
#include "common/Constants.h"
#include <sstream>
#include <iomanip>
#include <string_view>
#include "core/Logger.h"

namespace fs = std::filesystem;

// ── Directory Tree Validation ──────────────────────────────────────────────
// Validates that a path conforms to the expected Year/Month/Day hierarchy.
// Rejects paths that are too deep, files at the wrong depth, or folders
// with invalid date components.
static bool IsValidLogStructureEntry(const fs::path& entryPath, const fs::path& rootPath) {
    fs::path relPath = fs::relative(entryPath, rootPath);
    std::vector<std::string> parts;
    for (auto it = relPath.begin(); it != relPath.end(); ++it) {
        parts.push_back(it->string());
    }

    int depth = static_cast<int>(parts.size());

    // Detect whether root starts with a year folder or a named folder (offset=1).
    int offset = 0;
    if (depth >= 1 && parts[0].length() != 4) {
        offset = 1;
    } else if (depth >= 1 && parts[0].length() == 4) {
        try {
            int y = std::stoi(parts[0]);
            offset = (y >= 1000 && y <= 9999) ? 0 : 1;
        } catch (...) { offset = 1; }
    }

    // Validate Year (4-digit, 1000–9999)
    if (depth >= 1 + offset) {
        const auto& yearStr = parts[0 + offset];
        if (yearStr.length() != 4) return false;
        try {
            int year = std::stoi(yearStr);
            if (year < 1000 || year > 9999) return false;
        } catch (...) { return false; }
    }

    // Validate Month (2-digit, 01–12)
    if (depth >= 2 + offset) {
        const auto& monthStr = parts[1 + offset];
        if (monthStr.length() != 2) return false;
        try {
            int month = std::stoi(monthStr);
            if (month < 1 || month > 12) return false;
        } catch (...) { return false; }
    }

    // Validate Day (2-digit, 01–31, calendar-aware)
    if (depth >= 3 + offset) {
        const auto& dateStr = parts[2 + offset];
        if (dateStr.length() != 2) return false;
        try {
            int year = std::stoi(parts[0 + offset]);
            int month = std::stoi(parts[1 + offset]);
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

    // Depth 4+offset must be files, not directories
    if (depth == 4 + offset && fs::is_directory(entryPath)) return false;

    // Nothing deeper than depth 4+offset
    if (depth > 4 + offset) return false;

    // Files must be at exactly depth 4+offset
    if (depth < 4 + offset && !fs::is_directory(entryPath)) return false;

    return true;
}

// ── Constructor / Destructor ───────────────────────────────────────────────

LogStructureSyncService::LogStructureSyncService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}

LogStructureSyncService::~LogStructureSyncService() {
    Stop();
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

void LogStructureSyncService::Start() {
    if (syncThread_.joinable()) return;  // Already running
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

// ── Sync Worker Loop ───────────────────────────────────────────────────────
// Waits for either:
//   (a) RequestStructureSync() to set syncRequested_ = true (event-driven), or
//   (b) 60-second timeout (periodic fallback — catches missed events).
// In both cases, calls UploadDirectoryTree(). The deduplication check inside
// UploadDirectoryTree() (comparing against lastSyncedStructure_) ensures that
// unchanged structures produce zero HTTP traffic.

void LogStructureSyncService::SyncWorkerLoop(std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        {
            std::unique_lock<std::mutex> lock(syncMutex_);
            syncCv_.wait_for(lock, std::chrono::seconds(60), [this, &stoken]() {
                return syncRequested_.load() || stoken.stop_requested();
            });
        }

        if (stoken.stop_requested()) break;

        // Always sync — whether triggered by LogDirWatcher or by 60s timeout.
        // The deduplication inside UploadDirectoryTree() skips the HTTP call
        // if the tree hasn't changed, so this is safe to call unconditionally.
        syncRequested_.store(false);
        UploadDirectoryTree();
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

void LogStructureSyncService::RequestStructureSync() {
    syncRequested_.store(true);
    syncCv_.notify_one();
}

// ── Static Helpers ─────────────────────────────────────────────────────────

std::string LogStructureSyncService::FormatTime(fs::file_time_type ftime) {
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
                // Individual entry failure (permissions, locked file) should not
                // abort the entire tree scan — skip and continue.
                Logger::Warning("[LogStructureSyncService] Skipping entry: " + std::string(e.what()));
                continue;
            }
        }
    }
    catch (const fs::filesystem_error& e) {
        // directory_iterator itself can throw if the directory was deleted
        // between the exists() check and the iteration start.
        Logger::Warning("[LogStructureSyncService] Cannot iterate directory: " + std::string(e.what()));
    }

    return children;
}

// ── Core Sync Logic ────────────────────────────────────────────────────────

void LogStructureSyncService::UploadDirectoryTree() {
    // Guard: settings must be valid
    if (!settings_ || settings_->logFolderPath.empty()) {
        return;
    }

    // Guard: HTTP client must be available
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
            return;  // No changes since last sync — skip HTTP call
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
