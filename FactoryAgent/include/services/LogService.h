#ifndef LOG_SERVICE_H
#define LOG_SERVICE_H

#include "../common/Types.h"
#include "../../third_party/json/json.hpp"

using json = nlohmann::json;

class HttpClient;

class LogService {
public:
    LogService(AgentSettings* settings, HttpClient* client);
    ~LogService();

    void SyncLogsToServer();
    void UploadRequestedFile(const std::string& filePath, const std::string& requestId);
    static std::string FormatTime(std::filesystem::file_time_type ftime);
    static nlohmann::json BuildDirectoryTree(const std::filesystem::path& currentPath, const std::filesystem::path& rootPath);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    std::string lastSyncedStructure_;
    bool syncSpreadApplied_;
    
    int CalculateSyncSpreadDelay();

    LogService(const LogService&);
    LogService& operator=(const LogService&);
};

#endif