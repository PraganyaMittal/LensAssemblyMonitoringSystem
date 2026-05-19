#pragma once

#include <string>
#include <map>
#include <nlohmann/json.hpp>
#include "common/Types.h"

using json = nlohmann::json;

class RestClient;

class ConfigManager {
public:
	ConfigManager();
	~ConfigManager();

	bool LoadConfig(const std::string& configPath);
	bool SaveConfig(const std::string& configPath);

	std::string GetValue(const std::string& key) const;
	void SetValue(const std::string& key, const std::string& value);

	bool ParseConfigFile(const std::string& filePath, std::string& content);
	bool WriteConfigFile(const std::string& filePath, const std::string& content);

	std::string GetCurrentModel(const std::string& configContent);
	bool UpdateCurrentModel(std::string& configContent, const std::string& modelName, const std::string& modelPath);

	// Remote config operations (merged from ConfigService)
	bool UploadConfigToServer(const std::string& configFilePath, RestClient* client, const std::string& requestId);
	bool ApplyConfigFromServer(const std::string& filePath, const std::string& content);

private:
	std::map<std::string, std::string> settings_;
};