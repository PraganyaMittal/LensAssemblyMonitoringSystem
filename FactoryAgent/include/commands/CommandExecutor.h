#pragma once

#include "common/Types.h"
#include "json/json.hpp"
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

	CommandExecutor(const CommandExecutor&) = delete;
	CommandExecutor& operator=(const CommandExecutor&) = delete;

	void ProcessCommands(const json& commands);
	bool ExecuteCommand(const json& command);

	void SetSyncWorker(SyncWorker* sw) { syncWorker_ = sw; }
	void SetModelDeployer(ModelDeployer* deployer) { modelDeployer_ = deployer; }

private:
	void SendCommandResult(int commandId, const CommandResult& result);

	// Non-owning pointers
	HttpClient* httpClient_;
	ConfigService* configService_;
	ModelService* modelService_;
	PipeClient* pipeClient_;
	SyncWorker* syncWorker_;
	ModelDeployer* modelDeployer_;
};