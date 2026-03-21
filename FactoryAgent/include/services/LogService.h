#ifndef LOG_SERVICE_H
#define LOG_SERVICE_H

#include "common/Types.h"
#include "json/json.hpp"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>

using json = nlohmann::json;

class HttpClient;

class LogService {
public:
    LogService(AgentSettings* settings, HttpClient* client);
    ~LogService();

    // Start the background sync worker thread
    void Start();

    // Stop the background sync worker and wait for it to finish
    void Stop();

    // Request an async log sync (thundering-herd delay applied internally)
    void TriggerAsyncSync();

    void SyncLogsToServer();
    void UploadRequestedFile(const std::string& filePath, const std::string& requestId);
    static std::string FormatTime(std::filesystem::file_time_type ftime);
    static nlohmann::json BuildDirectoryTree(const std::filesystem::path& currentPath, const std::filesystem::path& rootPath);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    std::string lastSyncedStructure_;

    // Background sync worker
    std::thread syncThread_;
    std::mutex syncMutex_;
    std::condition_variable syncCv_;
    std::atomic<bool> syncRequested_{false};
    std::atomic<bool> running_{false};

    void SyncWorkerLoop();

    LogService(const LogService&);
    LogService& operator=(const LogService&);
};

#endif