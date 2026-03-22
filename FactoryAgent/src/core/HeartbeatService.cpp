#include "core/HeartbeatService.h"
#include "network/HttpClient.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include "utilities/CryptoUtils.h"
#include <fstream>
#include <string>
#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>
HeartbeatService::HeartbeatService() {
    startTick_ = GetTickCount64();
    CacheVersionInfo();
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

    
    request["agentVersion"] = cachedAgentVersion_;
    request["serviceVersion"] = cachedServiceVersion_;
    request["autoUpdaterVersion"] = cachedAutoUpdaterVersion_;
    request["laiVersion"] = cachedLaiVersion_;

    
    
    request["ipcConnected"] = ipcConnected_;
    if (ipcLastPingMs_ >= 0) {
        request["ipcLastPingMs"] = ipcLastPingMs_;
    }

    // --- Self-Diagnostics ---
    // Memory usage (working set in MB)
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        request["memoryMB"] = static_cast<int>(pmc.WorkingSetSize / (1024 * 1024));
    }

    // Uptime in minutes
    ULONGLONG elapsedMs = GetTickCount64() - startTick_;
    request["uptimeMinutes"] = static_cast<int>(elapsedMs / 60000);

    // Error count since startup
    request["errorCount"] = Logger::GetErrorCount();

    // Thread count
    int threadCount = 0;
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
    if (hSnapshot != INVALID_HANDLE_VALUE) {
        THREADENTRY32 te;
        te.dwSize = sizeof(te);
        DWORD pid = GetCurrentProcessId();
        if (Thread32First(hSnapshot, &te)) {
            do {
                if (te.th32OwnerProcessID == pid) threadCount++;
            } while (Thread32Next(hSnapshot, &te));
        }
        CloseHandle(hSnapshot);
    }
    request["threadCount"] = threadCount;

    // Config drift detection: hash the config file
    if (!configFilePath.empty()) {
        std::string configHash = CryptoUtils::ComputeFileSHA256(configFilePath);
        if (!configHash.empty()) {
            request["configHash"] = configHash;
        }
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

void HeartbeatService::CacheVersionInfo() {
    cachedAgentVersion_       = ReadVersionFile("version.txt");
    cachedServiceVersion_     = ReadVersionFile("..\\FactoryService\\version.txt");
    cachedAutoUpdaterVersion_ = ReadVersionFile("..\\AutoUpdater\\version.txt");
    cachedLaiVersion_         = ReadVersionFile("..\\LAI\\version.txt");
}