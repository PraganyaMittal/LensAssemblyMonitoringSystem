#include "../include/services/HeartbeatService.h"
#include "../include/common/Constants.h"

HeartbeatService::HeartbeatService() {
}

HeartbeatService::~HeartbeatService() {
}

bool HeartbeatService::SendHeartbeat(int mcId, bool isAppRunning, const std::string& configFilePath, HttpClient* client, json* commands) {
    if (client == NULL) {
        return false;
    }

    json request = BuildHeartbeatRequest(mcId, isAppRunning, configFilePath);
    json response;

    if (client->Post(AgentConstants::ENDPOINT_HEARTBEAT, request, response)) {
        if (ParseHeartbeatResponse(response, commands)) {
            return true;
        }
    }

    return false;
}

json HeartbeatService::BuildHeartbeatRequest(int mcId, bool isAppRunning, const std::string& configFilePath) {
    json request;
    request["mcId"] = mcId;
    request["isApplicationRunning"] = isAppRunning;

    // Read config.ini and extract current model name
    // If config.ini is deleted or unreadable, send empty string so server clears the flag
    std::string currentModelName = "";
    if (!configFilePath.empty()) {
        std::string configContent;
        if (FileUtils::ReadFileContent(configFilePath, configContent)) {
            ConfigManager tempCfg;
            currentModelName = tempCfg.GetCurrentModel(configContent);
        }
    }
    request["currentModelName"] = currentModelName;

    return request;
}

bool HeartbeatService::ParseHeartbeatResponse(const json& response, json* commands) {
    if (response.contains("success") && response["success"].get<bool>()) {
        // Extract pending commands from heartbeat response (fallback delivery)
        if (commands && response.contains("commands") && response["commands"].is_array()) {
            *commands = response["commands"];
        }
        return true;
    }
    return false;
}