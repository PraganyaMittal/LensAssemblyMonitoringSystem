#pragma once

#include <windows.h>
#include <string>

class ProcessManager {
public:
    ProcessManager() = default;
    ~ProcessManager();

    ProcessManager(const ProcessManager&) = delete;
    ProcessManager& operator=(const ProcessManager&) = delete;

    bool StartAgent();
    bool StartAgentWithRetry(int maxRetries = 3, DWORD delayMs = 2000);

    bool ForceStopAgent();
    void ResetState();



    static bool WaitForProcessExitByName(const wchar_t* exeName, DWORD timeoutMs = 15000);
    static bool ForceKillProcessByName(const wchar_t* exeName);

private:
    void CleanupHandles();
    std::wstring GetAgentPath();
    std::wstring GetAgentDirectory();
    bool IsRunningAsService();
    bool StartInUserSession(const std::wstring& exePath, const std::wstring& workDir);

    PROCESS_INFORMATION agentProcess_ = {};
    bool isRunning_ = false;
};
