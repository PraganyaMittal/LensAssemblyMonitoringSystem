#pragma once

#include <windows.h>
#include <string>
#include <thread>
#include <atomic>

class UpdateManager {
public:
    UpdateManager() = default;
    ~UpdateManager();

    UpdateManager(const UpdateManager&) = delete;
    UpdateManager& operator=(const UpdateManager&) = delete;

    void EnsureDirectories();
    void StartMonitoring(HANDLE updateEvent);
    void StopMonitoring();

    bool IsUpdateAvailable();
    bool IsUpdateAvailable(std::wstring& outPath);
    bool PerformUpdate();
    bool VerifyInstalledBinary();
    bool Rollback();

private:
    std::wstring GetBaseDirectory();
    std::wstring GetAgentPath();
    std::wstring GetUpdatesDir();
    std::wstring GetBackupDir();
    bool CheckForExeInUpdates();
    void MonitorThreadFunc(HANDLE updateEvent);

    std::wstring basePath_;
    std::thread monitorThread_;
    std::atomic<bool> monitoring_{false};
    HANDLE hStopMonitor_ = NULL;
};
