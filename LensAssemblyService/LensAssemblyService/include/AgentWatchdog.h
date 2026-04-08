#pragma once

// AgentWatchdog — Health check thread that monitors the agent every 15 seconds.
// Restarts the agent via CreateProcessAsUser if it crashes.
// Provides a general SuppressRestart/AllowRestart mechanism for intentional stops.

#include <windows.h>
#include <string>
#include <thread>
#include <atomic>
#include <mutex>

struct ServiceConfig;

class AgentWatchdog {
public:
	explicit AgentWatchdog(const ServiceConfig& config);
	~AgentWatchdog();

	AgentWatchdog(const AgentWatchdog&) = delete;
	AgentWatchdog& operator=(const AgentWatchdog&) = delete;

	void Start(HANDLE stopEvent);
	void Stop();

	// ── General suppress mechanism ──
	// Call SuppressRestart before any intentional agent stop.
	// Call AllowRestart when it's safe to monitor again.
	void SuppressRestart(const std::string& reason);
	void AllowRestart();
	bool IsRestartSuppressed() const;

private:
	void WatchLoop();
	bool IsAgentRunning();
	bool IsProcessRunning(const std::wstring& exeName);
	bool RestartAgent();

	const ServiceConfig& config_;
	std::thread watchThread_;
	HANDLE stopEvent_ = NULL;

	// Suppress mechanism
	std::atomic<bool> suppressRestart_{false};
	std::string suppressReason_;
	mutable std::mutex suppressMutex_;

	static constexpr DWORD CHECK_INTERVAL_MS = 15000;  // 15 seconds
	bool stopped_ = false;
};
