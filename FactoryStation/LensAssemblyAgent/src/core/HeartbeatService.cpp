#include "core/HeartbeatService.h"
#include "network/HttpClient.h"
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

bool HeartbeatService::SendHeartbeat(int mcId, bool isAppRunning, HttpClient* client, json* commands) {
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

    // Version info — read from exe resources (baked in at compile time)
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

// Read version info from PE exe resources using Windows API.
// No external text files needed — version is baked into each exe at compile time
// via VS_VERSION_INFO in the .rc resource file.
void HeartbeatService::CacheVersionInfo() {
    // Own exe version (agent)
    cachedAgentVersion_ = VersionHelper::GetOwnVersion();

    // Sibling exes in the same Bundle\ directory
    cachedServiceVersion_     = VersionHelper::GetSiblingVersion(AgentConstants::SERVICE_EXE_NAME);
    cachedAutoUpdaterVersion_ = VersionHelper::GetSiblingVersion(AgentConstants::UPDATER_EXE_NAME);

    // LAI exe is in a sibling folder: ..\LAI
    std::string baseDir = PathResolver::ResolveBaseDirA();
    cachedLaiVersion_ = VersionHelper::GetFileVersion(PathResolver::LaiDirA(baseDir) + AgentConstants::LAI_EXE_NAME);

    Logger::Info("[HeartbeatService] Versions cached — Agent: " + cachedAgentVersion_
        + ", Service: " + cachedServiceVersion_
        + ", Updater: " + cachedAutoUpdaterVersion_
        + ", LAI: " + cachedLaiVersion_);
}