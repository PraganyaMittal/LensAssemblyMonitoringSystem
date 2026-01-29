#include "../include/services/ConfigService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/FileUtils.h"
#include "../include/common/Constants.h"

ConfigService::ConfigService(AgentSettings* settings, HttpClient* client, ConfigManager* configMgr) {
    settings_ = settings;
    httpClient_ = client;
    configManager_ = configMgr;
}

ConfigService::~ConfigService() {
}

void ConfigService::SyncConfigToServer() {
    std::string configContent;
    if (!FileUtils::ReadFileContent(settings_->configFilePath, configContent)) {
        return;
    }

    if (configContent.empty() || configContent == lastConfigContent_) {
        return;
    }

    lastConfigContent_ = configContent;

    json request;
    request["mcId"] = settings_->mcId;
    request["configContent"] = configContent;

    json response;
    httpClient_->Post(AgentConstants::ENDPOINT_UPDATE_CONFIG, request, response);
}

bool ConfigService::ApplyConfigFromServer(const std::string& content) {
    if (content.empty()) {
        return false;
    }

    if (configManager_->WriteConfigFile(settings_->configFilePath, content)) {
        lastConfigContent_ = content;
        return true;
    }

    return false;
}