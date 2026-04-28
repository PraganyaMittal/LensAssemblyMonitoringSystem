#pragma once

#include <atomic>
#include <windows.h>






class ResourceGovernor {
public:
    
    
    
    static void Start(std::atomic<bool>& stopFlag, HANDLE stopEvent);

    
    
    static void Ping();

private:
    static void GovernorThread(std::atomic<bool>& stopFlag, HANDLE stopEvent);

    static constexpr size_t MEMORY_LIMIT_MB = 256;
    static constexpr int CHECK_INTERVAL_SEC = 30;
    static constexpr int DEADLOCK_TIMEOUT_SEC = 120; 

    static std::atomic<ULONGLONG> lastPingTick_;
};
