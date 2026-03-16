#ifndef LOG_DIR_WATCHER_H
#define LOG_DIR_WATCHER_H

#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <windows.h>
#include <functional>

class LogDirWatcher {
public:
    LogDirWatcher();
    ~LogDirWatcher();

    void Initialize(const std::wstring& watchDirectory, std::function<void()> onSyncTriggered);
    void Start();
    void Stop();

private:
    void MonitorLoop();
    void DebounceLoop();

    std::wstring watchDirectory_;
    std::function<void()> onSyncTriggered_;

    std::thread monitorThread_;
    std::thread debounceThread_;
    std::atomic<bool> running_;

    std::atomic<bool> isDirty_;
    std::atomic<long long> lastChangeTicks_;

    HANDLE dirHandle_;
    HANDLE overlapEvent_;

    std::vector<uint8_t> changeBuffer_;

    LogDirWatcher(const LogDirWatcher&);
    LogDirWatcher& operator=(const LogDirWatcher&);
};

#endif
