#pragma once

#include "common/Types.h"
#include "core/ConfigManager.h"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class RestClient;

class ConfigService {
public:
	ConfigService(AgentSettings* settings, RestClient* client, ConfigManager* configMgr);
	~ConfigService();

	ConfigService(const ConfigService&) = delete;
	ConfigService& operator=(const ConfigService&) = delete;

	bool UploadConfigToServer(const std::string& requestId);
	bool ApplyConfigFromServer(const std::string& content);

private:
	AgentSettings* settings_;
	RestClient* httpClient_;
	ConfigManager* configManager_;
	std::string lastConfigContent_;
};