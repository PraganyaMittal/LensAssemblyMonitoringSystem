#ifndef HEARTBEAT_SERVICE_H
#define HEARTBEAT_SERVICE_H

#include "common/Types.h"
#include "network/HttpClient.h"
#include "core/ConfigManager.h"
#include "utilities/FileUtils.h"
#include "json/json.hpp"
#include <atomic>

using json = nlohmann::json;

class HeartbeatService {
public:
    HeartbeatService();
    ~HeartbeatService();

    bool SendHeartbeat(int mcId, bool isAppRunning, const std::string& configFilePath, HttpClient* client, json* commands);

    
    void CacheVersionInfo();

    
    void SetIpcStatus(bool connected, int pingMs = -1) {
        ipcConnected_ = connected;
        ipcLastPingMs_ = pingMs;
    }

private:
    json BuildHeartbeatRequest(int mcId, bool isAppRunning, const std::string& configFilePath);
    bool ParseHeartbeatResponse(const json& response, json* commands);

    
    static std::string ReadVersionFile(const std::string& relativePath);

    bool ipcConnected_ = false;
    int ipcLastPingMs_ = -1;

    ULONGLONG startTick_ = 0; 

    
    std::string cachedAgentVersion_;
    std::string cachedServiceVersion_;
    std::string cachedAutoUpdaterVersion_;
    std::string cachedLaiVersion_;

    HeartbeatService(const HeartbeatService&);
    HeartbeatService& operator=(const HeartbeatService&);
};

#endif