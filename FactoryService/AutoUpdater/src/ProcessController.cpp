#include "pch.h"
#include "ProcessController.h"
#include "UpdateConfig.h"
#include <filesystem>
#include <fstream>

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")
#pragma comment(lib, "advapi32.lib")



bool ProcessController::IsRunningInSession0() {
    DWORD sessionId = 0;
    ProcessIdToSessionId(GetCurrentProcessId(), &sessionId);
    return sessionId == 0;
}

DWORD ProcessController::GetActiveUserSessionId() {
    return WTSGetActiveConsoleSessionId();
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



bool ProcessController::StopAgent() {
    if (!IsProcessRunning(UpdateConfig::AGENT_EXE)) {
        std::cout << "[ProcessCtrl] Agent not running." << std::endl;
        return true;
    }

    std::cout << "[ProcessCtrl] Requesting graceful Agent shutdown via marker file..." << std::endl;
    
    std::wstring stopFilePath = UpdateConfig::g_Paths.UPDATE_DIR + L".stop_agent";
    try {
        std::ofstream stopMarker(stopFilePath);
        stopMarker << "stop" << std::endl;
        stopMarker.close();
    } catch (...) {
        std::cerr << "[ProcessCtrl] Failed to write stop marker file." << std::endl;
    }

    // Wait up to the configured process exit timeout (Agent timer runs every 5s)
    if (WaitForProcessExit(UpdateConfig::AGENT_EXE, UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
        std::cout << "[ProcessCtrl] Agent stopped gracefully." << std::endl;
        try { std::filesystem::remove(stopFilePath); } catch (...) {}
        return true;
    }
    try { std::filesystem::remove(stopFilePath); } catch (...) {}

    std::cout << "[ProcessCtrl] Graceful shutdown failed. Force-killing Agent..." << std::endl;
    ForceKillByName(UpdateConfig::AGENT_EXE);

    if (WaitForProcessExit(UpdateConfig::AGENT_EXE, UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
        std::cout << "[ProcessCtrl] Agent stopped." << std::endl;
        return true;
    }

    std::cerr << "[ProcessCtrl] Agent did not exit in time." << std::endl;
    return false;
}

bool ProcessController::StopLAI() {
    if (!IsProcessRunning(UpdateConfig::LAI_EXE)) {
        std::cout << "[ProcessCtrl] LAI not running." << std::endl;
        return true;
    }

    std::cout << "[ProcessCtrl] Killing LAI..." << std::endl;
    ForceKillByName(UpdateConfig::LAI_EXE);

    if (WaitForProcessExit(UpdateConfig::LAI_EXE, UpdateConfig::PROCESS_EXIT_TIMEOUT_MS)) {
        std::cout << "[ProcessCtrl] LAI stopped." << std::endl;
        return true;
    }

    std::cerr << "[ProcessCtrl] LAI did not exit in time." << std::endl;
    return false;
}

bool ProcessController::StopService() {
    std::cout << "[ProcessCtrl] Stopping FactoryService via SCM..." << std::endl;

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) {
        std::cerr << "[ProcessCtrl] OpenSCManager failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    SC_HANDLE hService = OpenServiceW(hSCM, UpdateConfig::SERVICE_NAME, SERVICE_STOP | SERVICE_QUERY_STATUS);
    if (!hService) {
        std::cerr << "[ProcessCtrl] OpenService failed. Error: " << GetLastError() << std::endl;
        CloseServiceHandle(hSCM);
        return false;
    }

    SERVICE_STATUS status = {};
    if (!ControlService(hService, SERVICE_CONTROL_STOP, &status)) {
        DWORD err = GetLastError();
        if (err == ERROR_SERVICE_NOT_ACTIVE) {
            std::cout << "[ProcessCtrl] Service already stopped." << std::endl;
            CloseServiceHandle(hService);
            CloseServiceHandle(hSCM);
            return true;
        }
        std::cerr << "[ProcessCtrl] ControlService STOP failed. Error: " << err << std::endl;
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
                std::cout << "[ProcessCtrl] Service stopped." << std::endl;
                CloseServiceHandle(hService);
                CloseServiceHandle(hSCM);
                return true;
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    std::cerr << "[ProcessCtrl] Service did not stop in time." << std::endl;
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return false;
}



bool ProcessController::StartService() {
    std::cout << "[ProcessCtrl] Starting FactoryService via SCM..." << std::endl;

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) {
        std::cerr << "[ProcessCtrl] OpenSCManager failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    SC_HANDLE hService = OpenServiceW(hSCM, UpdateConfig::SERVICE_NAME, SERVICE_START | SERVICE_QUERY_STATUS);
    if (!hService) {
        std::cerr << "[ProcessCtrl] OpenService failed. Error: " << GetLastError() << std::endl;
        CloseServiceHandle(hSCM);
        return false;
    }

    if (!::StartServiceW(hService, 0, NULL)) {
        DWORD err = GetLastError();
        if (err == ERROR_SERVICE_ALREADY_RUNNING) {
            std::cout << "[ProcessCtrl] Service already running." << std::endl;
            CloseServiceHandle(hService);
            CloseServiceHandle(hSCM);
            return true;
        }
        std::cerr << "[ProcessCtrl] StartService failed. Error: " << err << std::endl;
        CloseServiceHandle(hService);
        CloseServiceHandle(hSCM);
        return false;
    }

    std::cout << "[ProcessCtrl] Service start command sent. Waiting for SERVICE_RUNNING..." << std::endl;

    auto start = std::chrono::steady_clock::now();
    while (std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start).count() < UpdateConfig::SERVICE_STOP_TIMEOUT_MS) {
        SERVICE_STATUS_PROCESS ssp = {};
        DWORD bytesNeeded = 0;
        if (QueryServiceStatusEx(hService, SC_STATUS_PROCESS_INFO, (LPBYTE)&ssp, sizeof(ssp), &bytesNeeded)) {
            if (ssp.dwCurrentState == SERVICE_RUNNING) {
                std::cout << "[ProcessCtrl] Service is running." << std::endl;
                CloseServiceHandle(hService);
                CloseServiceHandle(hSCM);
                return true;
            }
            if (ssp.dwCurrentState == SERVICE_STOPPED || ssp.dwCurrentState == SERVICE_STOP_PENDING) {
                std::cerr << "[ProcessCtrl] Service stopped unexpectedly during startup." << std::endl;
                CloseServiceHandle(hService);
                CloseServiceHandle(hSCM);
                return false;
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    std::cerr << "[ProcessCtrl] Service did not reach RUNNING state in time." << std::endl;
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return false;
}

bool ProcessController::StartProcessInUserSession(const std::wstring& exePath, const std::wstring& workDir) {
    DWORD sessionId = GetActiveUserSessionId();
    if (sessionId == 0xFFFFFFFF) {
        std::cerr << "[ProcessCtrl] No active user session." << std::endl;
        return false;
    }

    HANDLE hUserToken = NULL;
    if (!WTSQueryUserToken(sessionId, &hUserToken)) {
        std::cerr << "[ProcessCtrl] WTSQueryUserToken failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    LPVOID pEnv = NULL;
    if (!CreateEnvironmentBlock(&pEnv, hUserToken, FALSE)) {
        CloseHandle(hUserToken);
        return false;
    }

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    wchar_t desktopName[] = L"winsta0\\default";
    si.lpDesktop = desktopName;

    PROCESS_INFORMATION pi = {};
    BOOL ok = CreateProcessAsUserW(
        hUserToken,
        exePath.c_str(),
        NULL, NULL, NULL, FALSE,
        CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
        pEnv,
        workDir.c_str(),
        &si,
        &pi
    );

    DestroyEnvironmentBlock(pEnv);
    CloseHandle(hUserToken);

    if (!ok) {
        std::cerr << "[ProcessCtrl] CreateProcessAsUser failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[ProcessCtrl] Process started in user session. PID: " << pi.dwProcessId << std::endl;
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return true;
}

bool ProcessController::StartAgent() {
    std::wstring agentPath = UpdateConfig::g_Paths.BUNDLE_DIR + UpdateConfig::AGENT_EXE;
    std::cout << "[ProcessCtrl] Starting Agent..." << std::endl;

    if (GetFileAttributesW(agentPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cerr << "[ProcessCtrl] FactoryAgent.exe not found!" << std::endl;
        return false;
    }

    
    if (IsRunningInSession0()) {
        return StartProcessInUserSession(agentPath, UpdateConfig::g_Paths.BUNDLE_DIR);
    }

    
    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    BOOL ok = CreateProcessW(agentPath.c_str(), NULL, NULL, NULL, FALSE,
                              CREATE_NEW_CONSOLE, NULL, UpdateConfig::g_Paths.BUNDLE_DIR.c_str(), &si, &pi);
    if (!ok) {
        std::cerr << "[ProcessCtrl] CreateProcess failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[ProcessCtrl] Agent started. PID: " << pi.dwProcessId << std::endl;
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return true;
}

bool ProcessController::StartLAI() {
    std::wstring laiPath = UpdateConfig::g_Paths.LAI_DIR + UpdateConfig::LAI_EXE;
    std::cout << "[ProcessCtrl] Starting LAI..." << std::endl;

    if (GetFileAttributesW(laiPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cout << "[ProcessCtrl] LAI.exe not found. Skipping." << std::endl;
        return true;  
    }

    if (IsRunningInSession0()) {
        return StartProcessInUserSession(laiPath, UpdateConfig::g_Paths.LAI_DIR);
    }

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    BOOL ok = CreateProcessW(laiPath.c_str(), NULL, NULL, NULL, FALSE,
                              CREATE_NEW_CONSOLE, NULL, UpdateConfig::g_Paths.LAI_DIR.c_str(), &si, &pi);
    if (!ok) {
        std::cerr << "[ProcessCtrl] CreateProcess for LAI failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[ProcessCtrl] LAI started. PID: " << pi.dwProcessId << std::endl;
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return true;
}
