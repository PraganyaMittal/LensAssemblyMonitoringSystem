#pragma once

#include <string>
#include <atomic>
#include <vector>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <windows.h>
#include <functional>

/// @brief Monitors a directory for file changes using Win32 ReadDirectoryChangesW.
///        Uses std::jthread (C++20) for automatic lifecycle management.
///        Implements a 5-second debounce to avoid triggering on every individual file change.
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
    void DebounceLoop(std::stop_token stoken);

    std::wstring watchDirectory_;
    std::function<void()> onSyncTriggered_;

    std::jthread monitorThread_;
    std::jthread debounceThread_;

    std::atomic<bool> isDirty_{false};
    std::atomic<long long> lastChangeTicks_{0};

    // Condition variable for debounce — replaces sleep_for(500ms) busy-wait
    std::mutex debounceMutex_;
    std::condition_variable_any debounceCv_;

    // Win32 handles for ReadDirectoryChangesW
    HANDLE dirHandle_ = INVALID_HANDLE_VALUE;
    HANDLE overlapEvent_ = nullptr;

    // 64KB buffer — maximum allowed size for network-mounted drives (NAS)
    std::vector<uint8_t> changeBuffer_;
};
