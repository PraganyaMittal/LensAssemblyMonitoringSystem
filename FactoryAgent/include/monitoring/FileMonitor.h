#ifndef FILE_MONITOR_H
#define FILE_MONITOR_H



#include <string>
#include <windows.h>

typedef void (*FileChangeCallback)(const std::string& content, void* userData);

class FileMonitor {
public:
    FileMonitor();
    ~FileMonitor();

    bool StartMonitoring(const std::string& filePath, FileChangeCallback callback, void* userData);
    void StopMonitoring();
    bool IsMonitoring() const;

private:
    HANDLE monitorThread_;
    bool isMonitoring_;
    std::string filePath_;
    std::string lastHash_;
    FileChangeCallback callback_;
    void* userData_;

    static DWORD WINAPI MonitorThreadFunc(LPVOID param);
    void MonitorLoop();
    bool GetFileHash(const std::string& filePath, std::string& hash);
};

#endif