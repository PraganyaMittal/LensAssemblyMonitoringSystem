#include "pch.h"
#include "ProcessController.h"
#include "UpdateConfig.h"
#include "ExeNames.h"
#include "UpdaterModules.h"
#include <LogEngine.h>
#include <filesystem>
#include <fstream>

static constexpr const char* MOD = "ProcessController";

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")
#pragma comment(lib, "advapi32.lib")



bool ProcessController::IsRunningInSession0() {
	DWORD sessionId = 0;
	ProcessIdToSessionId(GetCurrentProcessId(), &sessionId);
	return sessionId == 0;
}

DWORD ProcessController::GetActiveUserSessionId() {
	DWORD activeSession = 0xFFFFFFFF;
	PWTS_SESSION_INFOW pSessionInfo = NULL;
	DWORD count = 0;

	if (WTSEnumerateSessionsW(WTS_CURRENT_SERVER_HANDLE, 0, 1, &pSessionInfo, &count)) {
		for (DWORD i = 0; i < count; i++) {
			if (pSessionInfo[i].State == WTSActive) {
				activeSession = pSessionInfo[i].SessionId;
				break;
			}
		}
		WTSFreeMemory(pSessionInfo);
	}
	
	if (activeSession == 0xFFFFFFFF) {
		activeSession = WTSGetActiveConsoleSessionId();
	}
	return activeSession;
}



bool ProcessController::IsProcessRunning(const wchar_t* exeName) {
	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if (snapshot == INVALID_HANDLE_VALUE) return false;

	PROCESSENTRY32W pe = {};
	pe.dwSize = sizeof(pe);
	bool found = false;

	if (Process32FirstW(snapshot, &pe)) {
		do {
			if (_wcsicmp(pe.szExeFile, exeName) == 0) {
				found = true;
				break;
			}
		} while (Process32NextW(snapshot, &pe));
	}

	CloseHandle(snapshot);
	return found;
}

bool ProcessController::WaitForProcessExit(const wchar_t* exeName, DWORD timeoutMs) {
	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if (snapshot == INVALID_HANDLE_VALUE) return false;

	PROCESSENTRY32W pe = {};
	pe.dwSize = sizeof(pe);
	HANDLE hProcess = NULL;

	if (Process32FirstW(snapshot, &pe)) {
		do {
			if (_wcsicmp(pe.szExeFile, exeName) == 0) {
				hProcess = OpenProcess(SYNCHRONIZE, FALSE, pe.th32ProcessID);
				break;
			}
		} while (Process32NextW(snapshot, &pe));
	}
	CloseHandle(snapshot);

	if (hProcess) {
		DWORD waitResult = WaitForSingleObject(hProcess, timeoutMs);
		CloseHandle(hProcess);
		return waitResult == WAIT_OBJECT_0;
	}
	return true;
}

bool ProcessController::ForceKillByName(const wchar_t* exeName) {
	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if (snapshot == INVALID_HANDLE_VALUE) return false;

	PROCESSENTRY32W pe = {};
	pe.dwSize = sizeof(pe);
	bool killed = false;

	if (Process32FirstW(snapshot, &pe)) {
		do {
			if (_wcsicmp(pe.szExeFile, exeName) == 0) {
				HANDLE hProc = OpenProcess(PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
				if (hProc) {
					if (TerminateProcess(hProc, 1)) killed = true;
					CloseHandle(hProc);
				}
			}
		} while (Process32NextW(snapshot, &pe));
	}

	CloseHandle(snapshot);
	return killed;
}



bool ProcessController::StopAgent(const UpdateConfig::RuntimeConfig& runtime) {
	if (!IsProcessRunning(runtime.agentExe.c_str())) {
		LogEngine::Info(MOD, "Agent not running.");
		return true;
	}

	// Primary: Signal via Global Named Event (instant, zero-latency)
	LogEngine::Info(MOD, "Signaling Agent via Global Named Event...");
	HANDLE hEvent = OpenEventW(EVENT_MODIFY_STATE, FALSE, GLOBAL_AGENT_STOP_EVENT);
	if (hEvent) {
		SetEvent(hEvent);
		CloseHandle(hEvent);
	}

	if (WaitForProcessExit(runtime.agentExe.c_str(), UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
		LogEngine::Info(MOD, "Agent stopped gracefully.");
		return true;
	}

	// Fallback: Force kill if graceful shutdown timed out
	LogEngine::Warning(MOD, "Graceful stop timed out. Force-killing Agent...");
	ForceKillByName(runtime.agentExe.c_str());

	if (WaitForProcessExit(runtime.agentExe.c_str(), UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
		LogEngine::Info(MOD, "Agent stopped.");
		return true;
	}

	LogEngine::Error(MOD, "Agent did not exit in time.");
	return false;
}

bool ProcessController::StopLAI(const UpdateConfig::RuntimeConfig& runtime) {
	if (!IsProcessRunning(runtime.laiExe.c_str())) {
		LogEngine::Info(MOD, "LAI not running.");
		return true;
	}

	LogEngine::Info(MOD, "Killing LAI...");
	ForceKillByName(runtime.laiExe.c_str());

	if (WaitForProcessExit(runtime.laiExe.c_str(), UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
		LogEngine::Info(MOD, "LAI stopped.");
		return true;
	}

	LogEngine::Error(MOD, "LAI did not exit in time.");
	return false;
}

bool ProcessController::StopService(const UpdateConfig::RuntimeConfig& runtime) {
	LogEngine::Info(MOD, "Stopping Service via SCM...");

	SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
	if (!hSCM) {
		LogEngine::Error(MOD, "OpenSCManager failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	SC_HANDLE hService = OpenServiceW(hSCM, runtime.serviceName.c_str(), SERVICE_STOP | SERVICE_QUERY_STATUS);
	if (!hService) {
		LogEngine::Error(MOD, "OpenService failed. Error: " + std::to_string(GetLastError()));
		CloseServiceHandle(hSCM);
		return false;
	}

	SERVICE_STATUS status = {};
	if (!ControlService(hService, SERVICE_CONTROL_STOP, &status)) {
		DWORD err = GetLastError();
		if (err == ERROR_SERVICE_NOT_ACTIVE) {
			LogEngine::Info(MOD, "Service already stopped.");
			CloseServiceHandle(hService);
			CloseServiceHandle(hSCM);
			return true;
		}
		LogEngine::Error(MOD, "ControlService STOP failed. Error: " + std::to_string(err));
		CloseServiceHandle(hService);
		CloseServiceHandle(hSCM);
		return false;
	}

	
	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < UpdateConfig::SERVICE_STOP_TIMEOUT_MS) {
		SERVICE_STATUS_PROCESS ssp = {};
		DWORD bytesNeeded = 0;
		if (QueryServiceStatusEx(hService, SC_STATUS_PROCESS_INFO, (LPBYTE)&ssp, sizeof(ssp), &bytesNeeded)) {
			if (ssp.dwCurrentState == SERVICE_STOPPED) {
				LogEngine::Info(MOD, "Service stopped.");
				CloseServiceHandle(hService);
				CloseServiceHandle(hSCM);
				return true;
			}
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(500));
	}

	LogEngine::Error(MOD, "Service did not stop in time.");
	CloseServiceHandle(hService);
	CloseServiceHandle(hSCM);
	return false;
}



bool ProcessController::StartService(const UpdateConfig::RuntimeConfig& runtime) {
	LogEngine::Info(MOD, "Starting Service via SCM...");

	SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
	if (!hSCM) {
		LogEngine::Error(MOD, "OpenSCManager failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	SC_HANDLE hService = OpenServiceW(hSCM, runtime.serviceName.c_str(), SERVICE_START | SERVICE_QUERY_STATUS);
	if (!hService) {
		LogEngine::Error(MOD, "OpenService failed. Error: " + std::to_string(GetLastError()));
		CloseServiceHandle(hSCM);
		return false;
	}

	if (!::StartServiceW(hService, 0, NULL)) {
		DWORD err = GetLastError();
		if (err == ERROR_SERVICE_ALREADY_RUNNING) {
			LogEngine::Info(MOD, "Service already running.");
			CloseServiceHandle(hService);
			CloseServiceHandle(hSCM);
			return true;
		}
		LogEngine::Error(MOD, "StartService failed. Error: " + std::to_string(err));
		CloseServiceHandle(hService);
		CloseServiceHandle(hSCM);
		return false;
	}

	LogEngine::Info(MOD, "Service start command sent. Waiting for SERVICE_RUNNING...");

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < UpdateConfig::SERVICE_STOP_TIMEOUT_MS) {
		SERVICE_STATUS_PROCESS ssp = {};
		DWORD bytesNeeded = 0;
		if (QueryServiceStatusEx(hService, SC_STATUS_PROCESS_INFO, (LPBYTE)&ssp, sizeof(ssp), &bytesNeeded)) {
			if (ssp.dwCurrentState == SERVICE_RUNNING) {
				LogEngine::Info(MOD, "Service is running.");
				CloseServiceHandle(hService);
				CloseServiceHandle(hSCM);
				return true;
			}
			if (ssp.dwCurrentState == SERVICE_STOPPED || ssp.dwCurrentState == SERVICE_STOP_PENDING) {
				LogEngine::Error(MOD, "Service stopped unexpectedly during startup.");
				CloseServiceHandle(hService);
				CloseServiceHandle(hSCM);
				return false;
			}
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(500));
	}

	LogEngine::Error(MOD, "Service did not reach RUNNING state in time.");
	CloseServiceHandle(hService);
	CloseServiceHandle(hSCM);
	return false;
}

bool ProcessController::StartProcessInUserSession(const std::wstring& exePath, const std::wstring& workDir) {
	DWORD sessionId = GetActiveUserSessionId();
	if (sessionId == 0xFFFFFFFF) {
		LogEngine::Error(MOD, "No active user session.");
		return false;
	}

	HANDLE hUserToken = NULL;
	if (!WTSQueryUserToken(sessionId, &hUserToken)) {
		LogEngine::Error(MOD, "WTSQueryUserToken failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	HANDLE hDupToken = NULL;
	if (!DuplicateTokenEx(hUserToken, MAXIMUM_ALLOWED, NULL, SecurityIdentification, TokenPrimary, &hDupToken)) {
		LogEngine::Error(MOD, "DuplicateTokenEx failed. Error: " + std::to_string(GetLastError()));
		CloseHandle(hUserToken);
		return false;
	}

	LPVOID pEnv = NULL;
	if (!CreateEnvironmentBlock(&pEnv, hDupToken, FALSE)) {
		CloseHandle(hDupToken);
		CloseHandle(hUserToken);
		return false;
	}

	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	wchar_t desktopName[] = L"winsta0\\default";

	si.lpDesktop = desktopName;

	PROCESS_INFORMATION pi = {};
	BOOL ok = CreateProcessAsUserW(
		hDupToken,
		exePath.c_str(),
		NULL, NULL, NULL, FALSE,
		CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
		pEnv,
		workDir.c_str(),
		&si,
		&pi
	);

	DestroyEnvironmentBlock(pEnv);
	CloseHandle(hDupToken);
	CloseHandle(hUserToken);

	if (!ok) {
		LogEngine::Error(MOD, "CreateProcessAsUser failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	LogEngine::Info(MOD, "Process started in user session. PID: " + std::to_string(pi.dwProcessId));
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	return true;
}

bool ProcessController::StartAgent(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime) {
	std::wstring agentPath = paths.BUNDLE_DIR + runtime.agentExe.c_str();
	LogEngine::Info(MOD, "Starting Agent...");

	if (GetFileAttributesW(agentPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
		LogEngine::Error(MOD, "Agent exe not found!");
		return false;
	}

	
	if (IsRunningInSession0()) {
		return StartProcessInUserSession(agentPath, paths.BUNDLE_DIR);
	}

	
	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	PROCESS_INFORMATION pi = {};

	BOOL ok = CreateProcessW(agentPath.c_str(), NULL, NULL, NULL, FALSE,
							  CREATE_NEW_CONSOLE, NULL, paths.BUNDLE_DIR.c_str(), &si, &pi);
	if (!ok) {
		LogEngine::Error(MOD, "CreateProcess failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	LogEngine::Info(MOD, "Agent started. PID: " + std::to_string(pi.dwProcessId));
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	return true;
}

bool ProcessController::StartLAI(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime) {
	std::wstring laiPath = paths.LAI_DIR + runtime.laiExe.c_str();

	LogEngine::Info(UpdaterModuleStr(UpdaterModule::ProcessController), "Starting LAI...");

	if (GetFileAttributesW(laiPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
		LogEngine::Info(UpdaterModuleStr(UpdaterModule::ProcessController),
			"Target exe (" + UpdateConfig::WtoA(runtime.laiExe) + ") not found in LAI directory. Skipping startup.");
		return true;  
	}

	if (IsRunningInSession0()) {
		bool ok = StartProcessInUserSession(laiPath, paths.LAI_DIR);
		if (!ok) LogEngine::Error(UpdaterModuleStr(UpdaterModule::ProcessController), "StartProcessInUserSession failed for LAI.");
		return ok;
	}

	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	PROCESS_INFORMATION pi = {};

	BOOL ok = CreateProcessW(laiPath.c_str(), NULL, NULL, NULL, FALSE,
							  CREATE_NEW_CONSOLE, NULL, paths.LAI_DIR.c_str(), &si, &pi);
	if (!ok) {
		LogEngine::Error(UpdaterModuleStr(UpdaterModule::ProcessController),
			"CreateProcess for LAI failed. Error: " + std::to_string(GetLastError()));
		return false;
	}

	LogEngine::Info(UpdaterModuleStr(UpdaterModule::ProcessController),
		"LAI started. PID: " + std::to_string(pi.dwProcessId));
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	return true;
}

