#ifndef HEARTBEAT_SERVICE_H
#define HEARTBEAT_SERVICE_H

#include "../common/Types.h"
#include "../network/HttpClient.h"
#include "../../third_party/json/json.hpp"

using json = nlohmann::json;

class HeartbeatService {
public:
    HeartbeatService();
    ~HeartbeatService();

    bool SendHeartbeat(int mcId, bool isAppRunning, HttpClient* client);

private:
    json BuildHeartbeatRequest(int mcId, bool isAppRunning);
    bool ParseHeartbeatResponse(const json& response);

    HeartbeatService(const HeartbeatService&);
    HeartbeatService& operator=(const HeartbeatService&);
};

#endif