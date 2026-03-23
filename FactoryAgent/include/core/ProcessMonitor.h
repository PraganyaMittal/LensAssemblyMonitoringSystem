#pragma once

#include <string>
#include <windows.h>

class ProcessMonitor {
public:
	ProcessMonitor();
	~ProcessMonitor();

	bool IsProcessRunning(const std::wstring& processName);
};