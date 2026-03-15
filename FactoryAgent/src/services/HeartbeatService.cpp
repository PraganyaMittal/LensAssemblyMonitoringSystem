#include "../include/services/HeartbeatService.h"
#include "../include/common/Constants.h"
#include <fstream>

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

    
    
    std::string currentModelName = "";
    if (!configFilePath.empty()) {
        std::string configContent;
        if (FileUtils::ReadFileContent(configFilePath, configContent)) {
            ConfigManager tempCfg;
            currentModelName = tempCfg.GetCurrentModel(configContent);
        }
    }
    request["currentModelName"] = currentModelName;

    
    
    
    request["agentVersion"] = ReadVersionFile("version.txt");
    request["serviceVersion"] = ReadVersionFile("..\\FactoryService\\version.txt");
    request["autoUpdaterVersion"] = ReadVersionFile("..\\AutoUpdater\\version.txt");
    request["laiVersion"] = ReadVersionFile("..\\LAI\\version.txt");

    
    
    request["ipcConnected"] = ipcConnected_;
    if (ipcLastPingMs_ >= 0) {
        request["ipcLastPingMs"] = ipcLastPingMs_;
    }

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

std::string HeartbeatService::ReadVersionFile(const std::string& relativePath) {
    std::ifstream file(relativePath);
    if (!file.is_open()) return "";

    std::string version;
    std::getline(file, version);

    
    size_t start = version.find_first_not_of(" \t\r\n");
    size_t end = version.find_last_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    return version.substr(start, end - start + 1);
}