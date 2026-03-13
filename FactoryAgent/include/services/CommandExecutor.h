#ifndef COMMAND_EXECUTOR_H
#define COMMAND_EXECUTOR_H

/*
 * CommandExecutor.h
 * Coordinates command execution
 * Single Responsibility: Command execution coordination only
 *
 * Phase 2: Now signals SyncWorker after model/config changes
 *          and delegates model deployment to ModelDeployer.
 */

#include "../common/Types.h"
#include "../../third_party/json/json.hpp"
#include <set>
#include <mutex>

using json = nlohmann::json;

class HttpClient;
class ConfigService;
class ModelService;
class PipeClient;
class SyncWorker;
class ModelDeployer;

class CommandExecutor {
public:
    CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc, PipeClient* pipeCli);
    ~CommandExecutor();

    void ProcessCommands(const json& commands);
    bool ExecuteCommand(const json& command);

    // Phase 2: Wire up new components
    void SetSyncWorker(SyncWorker* sw) { syncWorker_ = sw; }
    void SetModelDeployer(ModelDeployer* deployer) { modelDeployer_ = deployer; }

private:
    HttpClient* httpClient_;
    ConfigService* configService_;
    ModelService* modelService_;
    PipeClient* pipeClient_;
    SyncWorker* syncWorker_;
    ModelDeployer* modelDeployer_;

    void SendCommandResult(int commandId, const CommandResult& result);

    CommandExecutor(const CommandExecutor&);
    CommandExecutor& operator=(const CommandExecutor&);
};

#endif