#pragma once

#include <windows.h>

class HealthChecker {
public:
	static bool VerifyServiceRunning(DWORD timeoutMs);
	static bool VerifyAgentRunning(DWORD timeoutMs);
	static bool VerifyLAIRunning(DWORD timeoutMs);
	static bool VerifyBundle();
	static bool VerifyLAI();
};
