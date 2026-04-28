#pragma once

// AgentWatchdog — Health check thread that monitors the agent every 15 seconds.
// Restarts the agent via CreateProcessAsUser if it crashes.
// Uses Global Mutex to detect when AutoUpdater is running (crash-safe).

#include <windows.h>
#include <string>
#include <thread>
#include <atomic>

struct ServiceConfig;

class AgentWatchdog {
public:
	explicit AgentWatchdog(const ServiceConfig& config);
	~AgentWatchdog();

	AgentWatchdog(const AgentWatchdog&) = delete;
	AgentWatchdog& operator=(const AgentWatchdog&) = delete;

	void Start(HANDLE stopEvent);
	void Stop();

private:
	void WatchLoop();
	bool IsAgentRunning();
	bool IsProcessRunning(const std::wstring& exeName);
	bool RestartAgent();

	const ServiceConfig& config_;
	std::thread watchThread_;
	HANDLE stopEvent_ = NULL;

	static constexpr DWORD CHECK_INTERVAL_MS = 15000;  // 15 seconds
	bool stopped_ = false;
};

