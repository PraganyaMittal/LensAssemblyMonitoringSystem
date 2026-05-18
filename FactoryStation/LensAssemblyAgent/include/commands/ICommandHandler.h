#pragma once








#include <string>
#include <nlohmann/json.hpp>
#include "common/Types.h"
#include "common/Constants.h"

using json = nlohmann::json;


class RestClient;
class ConfigService;
class ModelService;
class SyncWorker;
class ModelDeployer;


struct CommandContext {
	RestClient* httpClient = nullptr;
	ConfigService* configService = nullptr;
	ModelService* modelService = nullptr;
	SyncWorker* syncWorker = nullptr;
	ModelDeployer* modelDeployer = nullptr;
};


class ICommandHandler {
public:
	virtual ~ICommandHandler() = default;

	
	virtual bool CanHandle(const std::string& commandType) const = 0;

	
	virtual CommandResult Execute(int commandId, const std::string& commandType,
	                              const json& commandData, CommandContext& ctx) = 0;
};
