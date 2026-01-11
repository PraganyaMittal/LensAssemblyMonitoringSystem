#ifndef AGENT_CORE_H
#define AGENT_CORE_H

#include "../common/Types.h"
#include <windows.h>
#include "../network/WebSocketClient.h"

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

    HttpClient* httpClient_;
    WebSocketClient* webSocketClient_;
    RegistrationService* registrationService_;
    HeartbeatService* heartbeatService_;
    CommandExecutor* commandExecutor_;
    ConfigService* configService_;
    LogService* logService_;
    ModelService* modelService_;
    ConfigManager* configManager_;
    ProcessMonitor* processMonitor_;

    HANDLE workerThread_;
    bool isRunning_;
    bool stopRequested_;
    int connectionFailureCount_;

    static DWORD WINAPI WorkerThreadProc(LPVOID param);
    void WorkerLoop();

    AgentCore(const AgentCore&);
};

#endif