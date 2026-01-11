#ifndef AGENT_CORE_H
#define AGENT_CORE_H

#include "../common/Types.h"
#include <windows.h>
#include "../Interfaces/IWebSocketClient.h"
#include <memory>

namespace FactoryAgent { namespace Network { class WebSocketClient; } }

class HttpClient;
class RegistrationService;
class HeartbeatService;
class CommandExecutor;
class ConfigService;
class LogService;
class ModelService;
class ConfigManager;
class ProcessMonitor;

class AgentCore {
public:
    AgentCore();
    ~AgentCore();

    bool Initialize(const AgentSettings& settings);
    void Start();
    void Stop();
    bool IsRunning() const;
	AgentStatus GetStatus() const;



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
    std::unique_ptr<ConfigManager> configManager_;
    std::unique_ptr<ProcessMonitor> processMonitor_;

    HANDLE workerThread_;
    bool isRunning_;
    bool stopRequested_;
    int connectionFailureCount_;

    static DWORD WINAPI WorkerThreadProc(LPVOID param);
    void WorkerLoop();

    AgentCore(const AgentCore&);
};

#endif