#pragma once

#include <atomic>
#include <windows.h>

// ResourceGovernor monitors agent health:
// 1. Memory Watchdog - exits if memory exceeds 256 MB for 90 seconds
// 2. Deadlock Watchdog - exits if no heartbeat activity for 2 minutes
//
// Both trigger a clean exit so FactoryService can auto-restart the agent.
class ResourceGovernor {
public:
    // Start the governor thread. Call once from AgentCore::Start().
    // stopFlag: agent's stop flag (shared with all threads)
    // stopEvent: agent's stop event handle (for timed waits)
    static void Start(std::atomic<bool>& stopFlag, HANDLE stopEvent);

    // Call this from HeartbeatLoop every cycle to prove the agent is alive.
    // If this isn't called for 2 minutes, the watchdog triggers.
    static void Ping();

private:
    static void GovernorThread(std::atomic<bool>& stopFlag, HANDLE stopEvent);

    static constexpr size_t MEMORY_LIMIT_MB = 256;
    static constexpr int CHECK_INTERVAL_SEC = 30;
    static constexpr int DEADLOCK_TIMEOUT_SEC = 120; // 2 minutes

    static std::atomic<ULONGLONG> lastPingTick_;
};
