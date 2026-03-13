#ifndef CONFIG_SERVICE_H
#define CONFIG_SERVICE_H

/*
 * ConfigService.h
 * Handles configuration operations
 * Single Responsibility: Config management only
 */

#include "../common/Types.h"
#include "../monitoring/ConfigManager.h"
#include "../../third_party/json/json.hpp"

using json = nlohmann::json;

class HttpClient;

class ConfigService {
public:
    ConfigService(AgentSettings* settings, HttpClient* client, ConfigManager* configMgr);
    ~ConfigService();

    bool UploadConfigToServer(const std::string& requestId);
    bool ApplyConfigFromServer(const std::string& content);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    ConfigManager* configManager_;
    std::string lastConfigContent_;

    ConfigService(const ConfigService&);
    ConfigService& operator=(const ConfigService&);
};

#endif