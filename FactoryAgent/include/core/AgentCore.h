#ifndef AGENT_CORE_H
#define AGENT_CORE_H

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

class WebSocketClient;

class HttpClient;
class RegistrationService;
class HeartbeatService;
class CommandExecutor;
class ConfigService;
class LogService;
class ModelService;
class ImageService;
class ConfigManager;
class ProcessMonitor;
class YieldMonitor;
class LogDirWatcher;
class PipeClient;
class CommandQueue;
class SyncWorker;
class ModelDeployer;

class AgentCore {
public:
	AgentCore();
	~AgentCore();

	bool Initialize(const AgentSettings& settings);
	void ReloadSettings(const AgentSettings& settings);
	void Start();
	void Stop();
	bool IsRunning() const;
	AgentStatus GetStatus() const;
	AgentSettings GetSettings() const;



private:
	AgentSettings settings_;
	mutable std::shared_mutex settingsMutex_;  // Protects settings_ across threads

	std::unique_ptr<HttpClient> httpClient_;
	std::unique_ptr<WebSocketClient> webSocketClient_;
	std::unique_ptr<RegistrationService> registrationService_;
	std::unique_ptr<HeartbeatService> heartbeatService_;
	std::unique_ptr<CommandExecutor> commandExecutor_;
	std::unique_ptr<ConfigService> configService_;
	std::unique_ptr<LogService> logService_;
	std::unique_ptr<ModelService> modelService_;
	std::unique_ptr<ImageService> imageService_;
	std::unique_ptr<ConfigManager> configManager_;
	std::unique_ptr<ProcessMonitor> processMonitor_;
	std::unique_ptr<YieldMonitor> yieldMonitor_;
	std::unique_ptr<LogDirWatcher> logDirWatcher_;
	std::unique_ptr<PipeClient> pipeClient_;


	std::unique_ptr<CommandQueue> commandQueue_;
	std::unique_ptr<SyncWorker> syncWorker_;
	std::unique_ptr<ModelDeployer> modelDeployer_;

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Iphlpapi.lib")


	std::thread heartbeatThread_;
	std::thread syncThread_;
	std::thread commandThread_;
	std::thread ipReportThread_; 
	std::atomic<bool> stopFlag_{ false };
	HANDLE stopEvent_;


	std::thread ipcThread_;
	std::thread updateThread_;

	std::atomic<bool> isRunning_{false};
	std::atomic<bool> isRegistered_{false};
	std::atomic<int> connectionFailureCount_{0};


	HANDLE ipChangeHandle_;
	static void CALLBACK OnIpChange(PVOID CallerContext, PMIB_IPINTERFACE_ROW Row, MIB_NOTIFICATION_TYPE NotificationType);
	void ReportNewIp(const std::string& newIp);


	void HeartbeatLoop();
	void CommandWorkerLoop();



	static DWORD WINAPI IpcThreadProc(LPVOID param);
	void IpcLoop();


	static DWORD WINAPI UpdateThreadProc(LPVOID param);
	void UpdateLoop();

	AgentCore(const AgentCore&) = delete;
	AgentCore& operator=(const AgentCore&) = delete;
};

#endif