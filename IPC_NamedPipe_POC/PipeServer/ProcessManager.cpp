#include "ProcessManager.h"
#include "../Common/PipeProtocol.h"
#include <tlhelp32.h>
#include <wtsapi32.h>
#include <userenv.h>
#include <iostream>
#include <thread>
#include <chrono>

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")

ProcessManager::~ProcessManager() {
    if (isRunning_) ForceStopAgent();
}

std::wstring ProcessManager::GetAgentPath() {
    wchar_t modulePath[MAX_PATH];
    GetModuleFileNameW(NULL, modulePath, MAX_PATH);

    std::wstring dir(modulePath);
    size_t pos = dir.find_last_of(L"\\");
    if (pos != std::wstring::npos) dir = dir.substr(0, pos + 1);

    return dir + PipeProtocol::AGENT_EXE_NAME;
}

std::wstring ProcessManager::GetAgentDirectory() {
    std::wstring path = GetAgentPath();
    size_t pos = path.find_last_of(L"\\");
    return (pos != std::wstring::npos) ? path.substr(0, pos) : path;
}

bool ProcessManager::IsRunningAsService() {
    // A process in Session 0 is likely a service
    DWORD sessionId = 0;
    ProcessIdToSessionId(GetCurrentProcessId(), &sessionId);
    return sessionId == 0;
}

bool ProcessManager::StartInUserSession(const std::wstring& exePath, const std::wstring& workDir) {
    // Find the active console session (user's desktop)
    DWORD sessionId = WTSGetActiveConsoleSessionId();
    if (sessionId == 0xFFFFFFFF) {
        std::cerr << "[ProcessManager] No active user session found." << std::endl;
        return false;
    }

    std::cout << "[ProcessManager] Launching in user session: " << sessionId << std::endl;

    // Get the user's token for the active session
    HANDLE hUserToken = NULL;
    if (!WTSQueryUserToken(sessionId, &hUserToken)) {
        std::cerr << "[ProcessManager] WTSQueryUserToken failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    // Create environment block for the user
    LPVOID pEnv = NULL;
    if (!CreateEnvironmentBlock(&pEnv, hUserToken, FALSE)) {
        std::cerr << "[ProcessManager] CreateEnvironmentBlock failed." << std::endl;
        CloseHandle(hUserToken);
        return false;
    }

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    si.lpDesktop = (LPWSTR)L"winsta0\\default";
    ZeroMemory(&agentProcess_, sizeof(agentProcess_));

    BOOL ok = CreateProcessAsUserW(
        hUserToken,
        exePath.c_str(),
        NULL, NULL, NULL, FALSE,
        CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
        pEnv,
        workDir.c_str(),
        &si,
        &agentProcess_
    );

    DestroyEnvironmentBlock(pEnv);
    CloseHandle(hUserToken);

    if (!ok) {
        std::cerr << "[ProcessManager] CreateProcessAsUser failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    return true;
}

bool ProcessManager::StartAgent() {
    if (isRunning_) return true;

    std::wstring agentPath = GetAgentPath();
    std::wstring workDir = GetAgentDirectory();
    std::wcout << L"[ProcessManager] Launching: " << agentPath << std::endl;

    DWORD attrs = GetFileAttributesW(agentPath.c_str());
    if (attrs == INVALID_FILE_ATTRIBUTES) {
        std::cerr << "[ProcessManager] Agent exe not found!" << std::endl;
        return false;
    }

    bool launched = false;

    if (IsRunningAsService()) {
        // Service mode: launch in the user's desktop session
        launched = StartInUserSession(agentPath, workDir);
    } else {
        // Console mode: normal CreateProcess
        STARTUPINFOW si = {};
        si.cb = sizeof(si);
        ZeroMemory(&agentProcess_, sizeof(agentProcess_));

        launched = CreateProcessW(agentPath.c_str(), NULL, NULL, NULL, FALSE,
                                   CREATE_NEW_CONSOLE, NULL, workDir.c_str(),
                                   &si, &agentProcess_) != 0;

        if (!launched) {
            std::cerr << "[ProcessManager] CreateProcess failed. Error: " << GetLastError() << std::endl;
        }
    }

    if (!launched) return false;

    isRunning_ = true;
    std::cout << "[ProcessManager] Agent started. PID: " << agentProcess_.dwProcessId << std::endl;

    // Health check: verify it didn't crash immediately
    DWORD result = WaitForSingleObject(agentProcess_.hProcess, PipeProtocol::HEALTH_CHECK_INTERVAL);
    if (result == WAIT_OBJECT_0) {
        DWORD exitCode = 0;
        GetExitCodeProcess(agentProcess_.hProcess, &exitCode);
        std::cerr << "[ProcessManager] Agent crashed immediately! Exit code: " << exitCode << std::endl;
        CleanupHandles();
        return false;
    }

    return true;
}

bool ProcessManager::StartAgentWithRetry(int maxRetries, DWORD delayMs) {
    for (int i = 1; i <= maxRetries; i++) {
        std::cout << "[ProcessManager] Start attempt " << i << "/" << maxRetries << std::endl;

        if (StartAgent()) return true;

        if (i < maxRetries) {
            std::cout << "[ProcessManager] Retrying in " << delayMs << "ms..." << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));
        }
    }

    std::cerr << "[ProcessManager] All " << maxRetries << " attempts failed." << std::endl;
    return false;
}



bool ProcessManager::ForceStopAgent() {
    if (!isRunning_) return true;

    if (!TerminateProcess(agentProcess_.hProcess, 1)) {
        std::cerr << "[ProcessManager] TerminateProcess failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    WaitForSingleObject(agentProcess_.hProcess, 5000);
    CleanupHandles();
    return true;
}



void ProcessManager::ResetState() {
    CleanupHandles();
    std::cout << "[ProcessManager] State reset." << std::endl;
}



void ProcessManager::CleanupHandles() {
    if (agentProcess_.hProcess) CloseHandle(agentProcess_.hProcess);
    if (agentProcess_.hThread)  CloseHandle(agentProcess_.hThread);
    ZeroMemory(&agentProcess_, sizeof(agentProcess_));
    isRunning_ = false;
}

bool ProcessManager::WaitForProcessExitByName(const wchar_t* exeName, DWORD timeoutMs) {
    DWORD start = GetTickCount();

    while (true) {
        if (GetTickCount() - start >= timeoutMs) return false;

        HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == INVALID_HANDLE_VALUE) return false;

        PROCESSENTRY32W pe = {};
        pe.dwSize = sizeof(pe);
        bool found = false;

        if (Process32FirstW(snapshot, &pe)) {
            do {
                if (_wcsicmp(pe.szExeFile, exeName) == 0) { found = true; break; }
            } while (Process32NextW(snapshot, &pe));
        }

        CloseHandle(snapshot);
        if (!found) return true;

        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }
}

bool ProcessManager::ForceKillProcessByName(const wchar_t* exeName) {
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
