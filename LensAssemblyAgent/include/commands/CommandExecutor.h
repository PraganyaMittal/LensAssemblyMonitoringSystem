#pragma once

#include "common/Types.h"
#include "json/json.hpp"
#include <set>
#include <mutex>

using json = nlohmann::json;

class HttpClient;
class ConfigService;
class ModelService;
class SyncWorker;
class ModelDeployer;

class CommandExecutor {
public:
	// NOTE: PipeClient removed from constructor — agent creates one-shot instances on demand
	CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc);
	~CommandExecutor();

	CommandExecutor(const CommandExecutor&) = delete;
	CommandExecutor& operator=(const CommandExecutor&) = delete;

	void ProcessCommands(const json& commands);
	bool ExecuteCommand(const json& command);

	void SetSyncWorker(SyncWorker* sw) { syncWorker_ = sw; }
	void SetModelDeployer(ModelDeployer* deployer) { modelDeployer_ = deployer; }

private:
	void SendCommandResult(int commandId, const CommandResult& result);

	// Unified handler for all deploy/update/rollback commands.
	// Checks service is running → sends DEPLOY_REQUEST via IPC → self-exits agent.
	void HandleDeployCommand(int commandId, const std::string& commandType, const json& data);

	// Non-owning pointers
	HttpClient* httpClient_;
	ConfigService* configService_;
	ModelService* modelService_;
	// NOTE: pipeClient_ removed — one-shot PipeClient created in HandleDeployCommand
	SyncWorker* syncWorker_;
	ModelDeployer* modelDeployer_;
};