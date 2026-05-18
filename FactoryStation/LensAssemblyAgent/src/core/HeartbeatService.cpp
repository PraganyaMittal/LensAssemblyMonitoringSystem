#include "core/HeartbeatService.h"
#include "network/RestClient.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "utilities/VersionHelper.h"
#include "core/Logger.h"
#include "PathResolver.h"
#include <string>
#include <windows.h>

HeartbeatService::HeartbeatService() {
}

HeartbeatService::~HeartbeatService() {
}

bool HeartbeatService::SendHeartbeat(int mcId, bool isAppRunning, RestClient* client, json* commands) {
    if (client == NULL) {
        return false;
    }

    json request = BuildHeartbeatRequest(mcId, isAppRunning);
    json response;

    if (client->Post(AgentConstants::ENDPOINT_HEARTBEAT, request, response)) {
        if (ParseHeartbeatResponse(response, commands)) {
            return true;
        }
    }

    return false;
}

json HeartbeatService::BuildHeartbeatRequest(int mcId, bool isAppRunning) {
    json request;
    request["mcId"] = mcId;
    request["isApplicationRunning"] = isAppRunning;

    
    request["agentVersion"] = cachedAgentVersion_;
    request["serviceVersion"] = cachedServiceVersion_;
    request["autoUpdaterVersion"] = cachedAutoUpdaterVersion_;
    request["laiVersion"] = cachedLaiVersion_;


    return request;
}

bool HeartbeatService::ParseHeartbeatResponse(const json& response, json* commands) {
    if (response.contains("success") && response["success"].get<bool>()) {
        
        if (commands && response.contains("commands") && response["commands"].is_array()) {
            *commands = response["commands"];
        }
        return true;
    }
    return false;
}




void HeartbeatService::CacheVersionInfo() {
    
    cachedAgentVersion_ = VersionHelper::GetOwnVersion();

    
    cachedServiceVersion_     = VersionHelper::GetSiblingVersion(AgentConstants::SERVICE_EXE_NAME);
    cachedAutoUpdaterVersion_ = VersionHelper::GetSiblingVersion(AgentConstants::UPDATER_EXE_NAME);

    
    std::string baseDir = PathResolver::ResolveBaseDirA();
    cachedLaiVersion_ = VersionHelper::GetFileVersion(PathResolver::LaiDirA(baseDir) + AgentConstants::LAI_EXE_NAME);

    Logger::Info("[HeartbeatService] Versions cached — Agent: " + cachedAgentVersion_
        + ", Service: " + cachedServiceVersion_
        + ", Updater: " + cachedAutoUpdaterVersion_
        + ", LAI: " + cachedLaiVersion_);
}