#pragma once

#include <windows.h>
#include <string>

class ProcessController {
public:
    // ── Stop processes ──────────────────────────────────────────
    static bool StopAgent();
    static bool StopLAI();
    static bool StopService();

    // ── Start processes ─────────────────────────────────────────
    static bool StartAgent();
    static bool StartLAI();
    static bool StartService();

    // ── Utility ─────────────────────────────────────────────────
    static bool ForceKillByName(const wchar_t* exeName);
    static bool WaitForProcessExit(const wchar_t* exeName, DWORD timeoutMs);
    static bool IsProcessRunning(const wchar_t* exeName);

private:
    static bool StartProcessInUserSession(const std::wstring& exePath, const std::wstring& workDir);
    static bool IsRunningInSession0();
    static DWORD GetActiveUserSessionId();
};
