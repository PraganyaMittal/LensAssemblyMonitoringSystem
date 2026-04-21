#include "core/DiagnosticsService.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>

#pragma comment(lib, "psapi.lib")

DiagnosticsService::DiagnosticsService() {
    startTick_ = GetTickCount64();
}

DiagnosticsService::~DiagnosticsService() {
}

bool DiagnosticsService::SendDiagnostics(int mcId, const std::string& configFilePath, HttpClient* client) {
    if (client == nullptr || mcId <= 0) {
        return false;
    }

    json request = BuildDiagnosticsRequest(mcId, configFilePath);
    json response;

    if (client->Post(AgentConstants::ENDPOINT_DIAGNOSTICS, request, response)) {
        return true;
    }

    return false;
}

json DiagnosticsService::BuildDiagnosticsRequest(int mcId, const std::string& configFilePath) {
    json request;
    request["mcId"] = mcId;

    
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        request["memoryMB"] = static_cast<int>(pmc.WorkingSetSize / (1024 * 1024));
    }

    
    ULONGLONG elapsedMs = GetTickCount64() - startTick_;
    request["uptimeMinutes"] = static_cast<int>(elapsedMs / 60000);

    
    request["errorCount"] = Logger::GetErrorCount();

    
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

    

    return request;
}
