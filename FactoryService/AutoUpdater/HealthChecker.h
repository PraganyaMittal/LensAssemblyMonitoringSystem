#pragma once

#include <windows.h>

class HealthChecker {
public:
    // Verify each component is running after restart
    static bool VerifyServiceRunning(DWORD timeoutMs);
    static bool VerifyAgentRunning(DWORD timeoutMs);
    static bool VerifyLAIRunning(DWORD timeoutMs);

    // Run all health checks
    static bool VerifyAll();
};
