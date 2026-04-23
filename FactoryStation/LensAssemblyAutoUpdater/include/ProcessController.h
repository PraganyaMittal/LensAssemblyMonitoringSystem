#pragma once

#include "UpdateConfig.h"
#include <windows.h>
#include <string>

/// ProcessController — Manages process lifecycle for deployment operations.
/// All methods accept explicit Paths/RuntimeConfig parameters (no global state).

class ProcessController {
public:
	static bool StopAgent(const UpdateConfig::RuntimeConfig& runtime);
	static bool StopLAI(const UpdateConfig::RuntimeConfig& runtime);
	static bool StopService(const UpdateConfig::RuntimeConfig& runtime);

	static bool StartAgent(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime);
	static bool StartLAI(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime);
	static bool StartService(const UpdateConfig::RuntimeConfig& runtime);

	static bool ForceKillByName(const wchar_t* exeName);
	static bool WaitForProcessExit(const wchar_t* exeName, DWORD timeoutMs);
	static bool IsProcessRunning(const wchar_t* exeName);

private:
	static bool StartProcessInUserSession(const std::wstring& exePath, const std::wstring& workDir);
	static bool IsRunningInSession0();
	static DWORD GetActiveUserSessionId();
};
