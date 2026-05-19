#pragma once








#include <string>
#include <nlohmann/json.hpp>
#include "common/Types.h"
#include "common/Constants.h"

using json = nlohmann::json;


class RestClient;
class ConfigManager;
class ModelService;
class SyncWorker;
class ModelDeployer;


struct CommandContext {
	RestClient* httpClient = nullptr;
	ConfigManager* configManager = nullptr;
	ModelService* modelService = nullptr;
	SyncWorker* syncWorker = nullptr;
	ModelDeployer* modelDeployer = nullptr;
	std::string configFilePath;
};


class ICommandHandler {
public:
	virtual ~ICommandHandler() = default;

	
	virtual bool CanHandle(const std::string& commandType) const = 0;

	
	virtual CommandResult Execute(int commandId, const std::string& commandType,
	                              const json& commandData, CommandContext& ctx) = 0;
};
