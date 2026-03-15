#ifndef PROCESS_MONITOR_H
#define PROCESS_MONITOR_H



#include <string>
#include <windows.h>

class ProcessMonitor {
public:
    ProcessMonitor();
    ~ProcessMonitor();

    bool IsProcessRunning(const std::wstring& processName);
};

#endif