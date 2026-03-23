#include "utilities/ResourceGovernor.h"
#include "core/Logger.h"
#include <windows.h>
#include <psapi.h>
#include <thread>

#pragma comment(lib, "psapi.lib")

std::atomic<ULONGLONG> ResourceGovernor::lastPingTick_{0};

void ResourceGovernor::Start(std::atomic<bool>& stopFlag, HANDLE stopEvent) {
    
    lastPingTick_.store(GetTickCount64());

    
    std::thread(GovernorThread, std::ref(stopFlag), stopEvent).detach();
    Logger::Info("[ResourceGovernor] Started. Memory limit: "
                 + std::to_string(MEMORY_LIMIT_MB) + " MB, Deadlock timeout: "
                 + std::to_string(DEADLOCK_TIMEOUT_SEC) + "s");
}

void ResourceGovernor::Ping() {
    lastPingTick_.store(GetTickCount64());
}

void ResourceGovernor::GovernorThread(std::atomic<bool>& stopFlag, HANDLE stopEvent) {
    int memoryOverCount = 0; 

    while (!stopFlag.load()) {
        
        if (WaitForSingleObject(stopEvent, CHECK_INTERVAL_SEC * 1000) == WAIT_OBJECT_0) {
            break;
        }

        if (stopFlag.load()) break;

        
        PROCESS_MEMORY_COUNTERS pmc;
        if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
            size_t memMB = pmc.WorkingSetSize / (1024 * 1024);

            if (memMB > MEMORY_LIMIT_MB) {
                memoryOverCount++;
                Logger::Warning("[ResourceGovernor] Memory usage: " + std::to_string(memMB)
                               + " MB (exceeds " + std::to_string(MEMORY_LIMIT_MB)
                               + " MB, strike " + std::to_string(memoryOverCount) + "/3)");

                if (memoryOverCount >= 3) {
                    Logger::Error("[ResourceGovernor] Memory exceeded "
                                + std::to_string(MEMORY_LIMIT_MB)
                                + " MB for 90 seconds. Forcing exit for auto-restart.");
                    
                    ExitProcess(1);
                }
            } else {
                memoryOverCount = 0; 
            }
        }

        
        ULONGLONG lastPing = lastPingTick_.load();
        ULONGLONG now = GetTickCount64();
        ULONGLONG elapsedSec = (now - lastPing) / 1000;

        if (elapsedSec > DEADLOCK_TIMEOUT_SEC) {
            Logger::Error("[ResourceGovernor] No heartbeat activity for "
                         + std::to_string(elapsedSec)
                         + " seconds. Agent appears frozen. Forcing exit for auto-restart.");
            ExitProcess(2);
        }
    }
}
