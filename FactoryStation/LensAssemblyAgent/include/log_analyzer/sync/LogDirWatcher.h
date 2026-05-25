#pragma once

#include <string>
#include <vector>
#include <thread>
#include <windows.h>
#include <functional>

class LogDirWatcher {
public:
    LogDirWatcher() = default;
    ~LogDirWatcher();

    LogDirWatcher(const LogDirWatcher&) = delete;
    LogDirWatcher& operator=(const LogDirWatcher&) = delete;

    void Initialize(const std::wstring& watchDirectory, std::function<void()> onSyncTriggered);
    void Start();
    void Stop();

private:
    void MonitorLoop(std::stop_token stoken);

    std::wstring watchDirectory_;
    std::function<void()> onSyncTriggered_;

    std::jthread monitorThread_;

    HANDLE dirHandle_ = INVALID_HANDLE_VALUE;
    HANDLE overlapEvent_ = nullptr;

    // 64KB buffer — the maximum safe size for network-mounted drives (NAS/SMB).
    // ReadDirectoryChangesW silently fails with larger buffers on SMB shares.
    std::vector<uint8_t> changeBuffer_;
};
