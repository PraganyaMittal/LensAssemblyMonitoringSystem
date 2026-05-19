#pragma once








#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "commands/ICommandHandler.h"
#include "core/Logger.h"

using json = nlohmann::json;

class CommandDispatcher {
public:
	CommandDispatcher(RestClient* httpClient, ConfigManager* configMgr,
	                  ModelService* modelSvc);
	~CommandDispatcher() = default;

	
	void SetSyncWorker(SyncWorker* sw) { ctx_.syncWorker = sw; }
	void SetModelDeployer(ModelDeployer* md) { ctx_.modelDeployer = md; }
	void SetConfigFilePath(const std::string& path) { ctx_.configFilePath = path; }

	
	void RegisterHandler(std::unique_ptr<ICommandHandler> handler);

	
	void ProcessCommands(const json& commands);

	
	bool ExecuteCommand(const json& command);

private:
	
	void SendCommandResult(int commandId, const CommandResult& result);

	
	ICommandHandler* FindHandler(const std::string& commandType);

	CommandContext ctx_;
	std::vector<std::unique_ptr<ICommandHandler>> handlers_;

	
	std::unordered_map<std::string, ICommandHandler*> dispatchMap_;
};
