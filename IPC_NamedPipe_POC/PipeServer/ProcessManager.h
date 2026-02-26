#pragma once

#include <windows.h>
#include <iostream>
#include <string>
#include "../Common/PipeProtocol.h"

// Manages starting and stopping the PipeClient (agent) process
class ProcessManager {
private:
    PROCESS_INFORMATION agentProcess = {};
    bool isRunning = false;

    // Get the full path of the agent exe (same directory as server)
    std::wstring GetAgentPath() {
        wchar_t modulePath[MAX_PATH];
        GetModuleFileNameW(NULL, modulePath, MAX_PATH);

        // Strip the server exe name to get the directory
        std::wstring dir(modulePath);
        size_t lastSlash = dir.find_last_of(L"\\");
        if (lastSlash != std::wstring::npos) {
            dir = dir.substr(0, lastSlash + 1);
        }

        return dir + PipeProtocol::AGENT_EXE_NAME;
    }

public:
    // Launch PipeClient.exe
    bool StartAgent() {
        if (isRunning) {
            std::cout << "[ProcessManager] Agent is already running." << std::endl;
            return true;
        }

        std::wstring agentPath = GetAgentPath();

        STARTUPINFOW si = {};
        si.cb = sizeof(si);
        ZeroMemory(&agentProcess, sizeof(agentProcess));

        // CREATE_NEW_CONSOLE so the agent gets its own console window
        if (!CreateProcessW(
                agentPath.c_str(),  // exe path
                NULL,               // command line
                NULL,               // process security
                NULL,               // thread security
                FALSE,              // don't inherit handles
                CREATE_NEW_CONSOLE, // new console window for agent
                NULL,               // use parent's environment
                NULL,               // use parent's directory
                &si,
                &agentProcess)) {
            std::cerr << "[ProcessManager] CreateProcess failed. Error: " << GetLastError() << std::endl;
            std::wcerr << L"[ProcessManager] Tried to launch: " << agentPath << std::endl;
            return false;
        }

        isRunning = true;
        std::cout << "[ProcessManager] Agent started. PID: " << agentProcess.dwProcessId << std::endl;
        return true;
    }

    // Wait for the agent process to exit (with timeout)
    bool WaitForAgentExit(DWORD timeoutMs = 10000) {
        if (!isRunning) return true;

        DWORD result = WaitForSingleObject(agentProcess.hProcess, timeoutMs);
        if (result == WAIT_OBJECT_0) {
            std::cout << "[ProcessManager] Agent exited gracefully." << std::endl;
            CleanupHandles();
            return true;
        }

        std::cerr << "[ProcessManager] Agent did not exit within timeout." << std::endl;
        return false;
    }

    // Force-kill the agent if it didn't shut down gracefully
    bool ForceStopAgent() {
        if (!isRunning) return true;

        std::cerr << "[ProcessManager] Force-terminating agent..." << std::endl;
        if (!TerminateProcess(agentProcess.hProcess, 1)) {
            std::cerr << "[ProcessManager] TerminateProcess failed. Error: " << GetLastError() << std::endl;
            return false;
        }

        WaitForSingleObject(agentProcess.hProcess, 5000);
        CleanupHandles();
        std::cout << "[ProcessManager] Agent force-terminated." << std::endl;
        return true;
    }

    // Stop agent: try graceful wait first, then force-kill
    void StopAgent() {
        if (!isRunning) return;

        if (!WaitForAgentExit(5000)) {
            ForceStopAgent();
        }
    }

    bool IsAgentRunning() const { return isRunning; }

    HANDLE GetProcessHandle() const { return agentProcess.hProcess; }

private:
    void CleanupHandles() {
        if (agentProcess.hProcess) CloseHandle(agentProcess.hProcess);
        if (agentProcess.hThread) CloseHandle(agentProcess.hThread);
        ZeroMemory(&agentProcess, sizeof(agentProcess));
        isRunning = false;
    }

public:
    ~ProcessManager() {
        if (isRunning) {
            ForceStopAgent();
        }
    }
};
