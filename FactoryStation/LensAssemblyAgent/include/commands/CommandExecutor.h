#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <set>
#include <mutex>

using json = nlohmann::json;

class RestClient;
class ConfigService;
class ModelService;
class SyncWorker;
class ModelDeployer;

class CommandExecutor {
public:

	CommandExecutor(RestClient* client, ConfigService* configSvc, ModelService* modelSvc);
	~CommandExecutor();

	CommandExecutor(const CommandExecutor&) = delete;
	CommandExecutor& operator=(const CommandExecutor&) = delete;

	void ProcessCommands(const json& commands);
	bool ExecuteCommand(const json& command);

	void SetSyncWorker(SyncWorker* sw) { syncWorker_ = sw; }
	void SetModelDeployer(ModelDeployer* deployer) { modelDeployer_ = deployer; }

private:
	void SendCommandResult(int commandId, const CommandResult& result);

	
	
	void HandleDeployCommand(int commandId, const std::string& commandType, const json& data);

	
	RestClient* httpClient_;
	ConfigService* configService_;
	ModelService* modelService_;

	SyncWorker* syncWorker_;
	ModelDeployer* modelDeployer_;
};