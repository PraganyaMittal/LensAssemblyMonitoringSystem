#pragma once

#include "UpdateConfig.h"
#include <windows.h>

/// HealthChecker — Post-deployment health verification.
/// All methods accept explicit Paths/RuntimeConfig parameters (no global state).

class HealthChecker {
public:
	static bool VerifyServiceRunning(const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs);
	static bool VerifyAgentRunning(const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs);
	static bool VerifyLAIRunning(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs);
	static bool VerifyBundle(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime);
	static bool VerifyLAI(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime);
};
