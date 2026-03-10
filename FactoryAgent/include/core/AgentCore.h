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

#include "../common/Types.h"
#include "../Interfaces/IWebSocketClient.h"
#include <memory>
#include <atomic>

namespace FactoryAgent { namespace Network { class WebSocketClient; } }

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

    std::unique_ptr<HttpClient> httpClient_;
    std::unique_ptr<FactoryAgent::Interfaces::IWebSocketClient> webSocketClient_;
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

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Iphlpapi.lib")

    HANDLE workerThread_;
    HANDLE ipcThread_;
    HANDLE updateThread_;
    bool isRunning_;
    bool isRegistered_;
    std::atomic<bool> stopRequested_;
    int connectionFailureCount_;
    
    // IP Change notification
    HANDLE ipChangeHandle_;
    static void CALLBACK OnIpChange(PVOID CallerContext, PMIB_IPINTERFACE_ROW Row, MIB_NOTIFICATION_TYPE NotificationType);
    void ReportNewIp(const std::string& newIp);

    static DWORD WINAPI WorkerThreadProc(LPVOID param);
    void WorkerLoop();

    // IPC: Named pipe connection to PipeServer for managed updates
    static DWORD WINAPI IpcThreadProc(LPVOID param);
    void IpcLoop();

    // Polling for update commands (runs every 15s)
    static DWORD WINAPI UpdateThreadProc(LPVOID param);
    void UpdateLoop();

    AgentCore(const AgentCore&);
};

#endif