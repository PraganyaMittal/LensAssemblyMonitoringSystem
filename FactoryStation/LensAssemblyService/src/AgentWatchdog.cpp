#include "pch.h"
#include "AgentWatchdog.h"
#include "ServiceConfig.h"
#include "ServiceLogger.h"
#include "ExeNames.h"
#include <userenv.h>
#include <wtsapi32.h>
#include <tlhelp32.h>

#pragma comment(lib, "Userenv.lib")
#pragma comment(lib, "Wtsapi32.lib")

AgentWatchdog::AgentWatchdog(const ServiceConfig& config) : config_(config) {}

AgentWatchdog::~AgentWatchdog() {
	Stop();
}

void AgentWatchdog::Start(HANDLE stopEvent) {
	stopEvent_ = stopEvent;
	watchThread_ = std::thread(&AgentWatchdog::WatchLoop, this);
	PIPE_LOG_INFO("[Watchdog] Agent health check started (every 15 seconds).");
}

void AgentWatchdog::Stop() {
	if (stopped_) return;
	stopped_ = true;
	if (watchThread_.joinable()) {
		watchThread_.join();
	}
	PIPE_LOG_INFO("[Watchdog] Agent health check stopped.");
}

void AgentWatchdog::WatchLoop() {
	while (WaitForSingleObject(stopEvent_, CHECK_INTERVAL_MS) == WAIT_TIMEOUT) {
		HANDLE hMutex = OpenMutexW(SYNCHRONIZE, FALSE, GLOBAL_UPDATE_MUTEX);
		if (hMutex) {
			CloseHandle(hMutex);
			PIPE_LOG_INFO("[Watchdog] Update in progress (mutex held). Skipping check.");
			continue;
		}

		if (!IsAgentRunning()) {
			PIPE_LOG_INFO("[Watchdog] Agent not running. Attempting restart...");
			if (RestartAgent()) {
				PIPE_LOG_INFO("[Watchdog] Agent restarted successfully.");
			} else {
				PIPE_LOG_ERROR("[Watchdog] Failed to restart agent.");
			}
		}
	}
}

bool AgentWatchdog::IsAgentRunning() {
	return IsProcessRunning(config_.agentExe);
}

bool AgentWatchdog::IsProcessRunning(const std::wstring& exeName) {
	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if (snapshot == INVALID_HANDLE_VALUE) return false;

	PROCESSENTRY32W pe = {};
	pe.dwSize = sizeof(pe);
	bool found = false;

	if (Process32FirstW(snapshot, &pe)) {
		do {
			if (_wcsicmp(pe.szExeFile, exeName.c_str()) == 0) {
				found = true;
				break;
			}
		} while (Process32NextW(snapshot, &pe));
	}
	CloseHandle(snapshot);
	return found;
}



bool AgentWatchdog::RestartAgent() {
	std::wstring agentPath = config_.bundleDir + config_.agentExe;

	if (GetFileAttributesW(agentPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
		PIPE_LOG_ERROR("[Watchdog] Agent exe not found: " << ServiceConfig::WtoA(agentPath));
		return false;
	}

	DWORD sessionId = WTSGetActiveConsoleSessionId();
	if (sessionId == 0xFFFFFFFF) {
		PIPE_LOG_ERROR("[Watchdog] No active user session found.");
		return false;
	}

	HANDLE hUserToken = NULL;
	if (!WTSQueryUserToken(sessionId, &hUserToken)) {
		PIPE_LOG_ERROR("[Watchdog] WTSQueryUserToken failed. Error: " << GetLastError());
		return false;
	}

	HANDLE hDupToken = NULL;
	if (!DuplicateTokenEx(hUserToken, MAXIMUM_ALLOWED, NULL, SecurityIdentification, TokenPrimary, &hDupToken)) {
		PIPE_LOG_ERROR("[Watchdog] DuplicateTokenEx failed. Error: " << GetLastError());
		CloseHandle(hUserToken);
		return false;
	}

	LPVOID pEnv = NULL;
	if (!CreateEnvironmentBlock(&pEnv, hDupToken, FALSE)) {
		PIPE_LOG_ERROR("[Watchdog] CreateEnvironmentBlock failed. Error: " << GetLastError());
		CloseHandle(hDupToken);
		CloseHandle(hUserToken);
		return false;
	}

	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	si.lpDesktop = (LPWSTR)L"winsta0\\default";
	PROCESS_INFORMATION pi = {};

	std::wstring cmdLine = L"\"" + agentPath + L"\"";
	std::vector<wchar_t> cmdBuf(cmdLine.begin(), cmdLine.end());
	cmdBuf.push_back(L'\0');

	BOOL ok = CreateProcessAsUserW(
		hDupToken,
		agentPath.c_str(),
		cmdBuf.data(),
		NULL, NULL,
		FALSE,
		CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_CONSOLE,
		pEnv,
		config_.bundleDir.c_str(),
		&si, &pi
	);

	if (!ok) {
		PIPE_LOG_ERROR("[Watchdog] CreateProcessAsUser failed. Error: " << GetLastError());
	} else {
		PIPE_LOG_INFO("[Watchdog] Agent process created. PID: " << pi.dwProcessId);
		CloseHandle(pi.hProcess);
		CloseHandle(pi.hThread);
	}

	DestroyEnvironmentBlock(pEnv);
	CloseHandle(hDupToken);
	CloseHandle(hUserToken);

	return ok != FALSE;
}
