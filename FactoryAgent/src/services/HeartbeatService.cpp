#include "../include/services/HeartbeatService.h"
#include "../include/common/Constants.h"

HeartbeatService::HeartbeatService() {
}

HeartbeatService::~HeartbeatService() {
}

bool HeartbeatService::SendHeartbeat(int mcId, bool isAppRunning, HttpClient* client) {
    if (client == NULL) {
        return false;
    }

    json request = BuildHeartbeatRequest(mcId, isAppRunning);
    json response;

    if (client->Post(AgentConstants::ENDPOINT_HEARTBEAT, request, response)) {
        if (ParseHeartbeatResponse(response)) {
            return true;
        }
    }

    return false;
}

json HeartbeatService::BuildHeartbeatRequest(int mcId, bool isAppRunning) {
    json request;
    request["mcId"] = mcId;
    request["isApplicationRunning"] = isAppRunning;
    return request;
}

bool HeartbeatService::ParseHeartbeatResponse(const json& response) {
    if (response.contains("success") && response["success"].get<bool>()) {
        return true;
    }
    return false;
}