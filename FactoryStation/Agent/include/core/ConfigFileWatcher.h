#ifndef CONFIG_FILE_WATCHER_H
#define CONFIG_FILE_WATCHER_H

#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <windows.h>
#include <functional>

class ConfigFileWatcher {
public:
    ConfigFileWatcher();
    ~ConfigFileWatcher();

    void Initialize(const std::string& configFilePath, std::function<void(const std::string&)> onModelChanged);
    void Start();
    void Stop();

private:
    void MonitorLoop();
    void DebounceLoop();
    void ProcessFileChange();

    std::wstring watchDirectory_;
    std::wstring targetFileName_;
    std::string configFilePath_;
    std::function<void(const std::string&)> onModelChanged_;

    std::thread monitorThread_;
    std::thread debounceThread_;
    std::atomic<bool> running_;

    std::atomic<bool> isDirty_;
    std::atomic<long long> lastChangeTicks_;

    HANDLE dirHandle_;
    HANDLE overlapEvent_;

    std::vector<uint8_t> changeBuffer_;

    ConfigFileWatcher(const ConfigFileWatcher&);
    ConfigFileWatcher& operator=(const ConfigFileWatcher&);
};

#endif
