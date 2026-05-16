#pragma once

#include "common/Types.h"
#include "core/ConfigManager.h"
#include <nlohmann/json.hpp>
#include <vector>

using json = nlohmann::json;

class HttpClient;

class ModelService {
public:
	ModelService(AgentSettings* settings, HttpClient* client, ConfigManager* configMgr);
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
	// Non-owning pointers
	AgentSettings* settings_;
	HttpClient* httpClient_;
	ConfigManager* configManager_;
};