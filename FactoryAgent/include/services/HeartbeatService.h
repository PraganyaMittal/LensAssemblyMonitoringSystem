#ifndef HEARTBEAT_SERVICE_H
#define HEARTBEAT_SERVICE_H

#include "../common/Types.h"
#include "../network/HttpClient.h"
#include "../monitoring/ConfigManager.h"
#include "../utilities/FileUtils.h"
#include "../../third_party/json/json.hpp"

using json = nlohmann::json;

class HeartbeatService {
public:
    HeartbeatService();
    ~HeartbeatService();

    bool SendHeartbeat(int mcId, bool isAppRunning, const std::string& configFilePath, HttpClient* client, json* commands);

    
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

    HeartbeatService(const HeartbeatService&);
    HeartbeatService& operator=(const HeartbeatService&);
};

#endif