#pragma once

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#ifndef NTDDI_VERSION
#define NTDDI_VERSION 0x0A000000
#endif

#include <sdkddkver.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <netioapi.h>

#include "common/Types.h"
#include <memory>
#include <thread>
#include <atomic>
#include <shared_mutex>

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Iphlpapi.lib")

class WebSocketClient;
class RestClient;
class RegistrationService;
class HeartbeatService;
class CommandDispatcher;
class LogStructureSyncService;
class LogFileUploadService;
class ModelService;
class ImageUploadService;
class ConfigManager;
class ProcessMonitor;
class YieldMonitor;
class LogDirWatcher;
class CommandQueue;
class SyncWorker;
class ModelDeployer;
class ConfigFileWatcher;

class AgentCore {
public:
	AgentCore();
	~AgentCore();

	AgentCore(const AgentCore&) = delete;
	AgentCore& operator=(const AgentCore&) = delete;

	bool Initialize(const AgentSettings& settings);
	void ReloadSettings(const AgentSettings& settings);
	void Start();
	void Stop();
	bool IsRunning() const;
	AgentStatus GetStatus() const;
	AgentSettings GetSettings() const;

private:
	AgentSettings settings_;
	mutable std::shared_mutex settingsMutex_;

	std::unique_ptr<RestClient> httpClient_;
	std::unique_ptr<WebSocketClient> webSocketClient_;
	std::unique_ptr<RegistrationService> registrationService_;
	std::unique_ptr<HeartbeatService> heartbeatService_;
	std::unique_ptr<CommandDispatcher> commandDispatcher_;
	std::unique_ptr<LogStructureSyncService> logStructureSyncService_;
	std::unique_ptr<LogFileUploadService> logFileUploadService_;
	std::unique_ptr<ModelService> modelService_;
	std::unique_ptr<ImageUploadService> imageUploadService_;
	std::unique_ptr<ConfigManager> configManager_;
	std::unique_ptr<ProcessMonitor> processMonitor_;
	std::unique_ptr<YieldMonitor> yieldMonitor_;
	std::unique_ptr<LogDirWatcher> logDirWatcher_;
	std::unique_ptr<CommandQueue> commandQueue_;
	std::unique_ptr<CommandQueue> uploadQueue_;
	std::unique_ptr<SyncWorker> syncWorker_;
	std::unique_ptr<ModelDeployer> modelDeployer_;
	std::unique_ptr<ConfigFileWatcher> configFileWatcher_;

	std::thread heartbeatThread_;
	std::thread syncThread_;
	std::thread commandThread_;
	std::thread uploadThread_;
	std::thread ipReportThread_;
	std::atomic<bool> stopFlag_{false};
	std::atomic<bool> isRunning_{false};
	std::atomic<bool> isRegistered_{false};
	std::atomic<int> connectionFailureCount_{0};

	HANDLE stopEvent_ = NULL;
	HANDLE ipChangeHandle_ = nullptr;

	static void CALLBACK OnIpChange(PVOID CallerContext, PMIB_IPINTERFACE_ROW Row, MIB_NOTIFICATION_TYPE NotificationType);
	void ReportNewIp(const std::string& newIp);

	void HeartbeatLoop();
	void CommandWorkerLoop();
	void UploadWorkerLoop();
	void CheckUpdateResult();

};
