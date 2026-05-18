#pragma once

#include "common/Types.h"
#include "core/ConfigManager.h"
#include <nlohmann/json.hpp>
#include <vector>

using json = nlohmann::json;

class RestClient;

class ModelService {
public:
	ModelService(AgentSettings* settings, RestClient* client, ConfigManager* configMgr);
	~ModelService();

	ModelService(const ModelService&) = delete;
	ModelService& operator=(const ModelService&) = delete;

	std::vector<ModelInfo> GetModelFolders();
	void SyncModelsToServer();
	bool ChangeModel(const std::string& modelName);
	bool UploadModelToServer(const json& data);
	bool DeleteModel(const std::string& modelName);
	bool UploadModelToLibrary(const std::string& modelName, const std::string& uploadUrl);

private:
	
	AgentSettings* settings_;
	RestClient* httpClient_;
	ConfigManager* configManager_;
};