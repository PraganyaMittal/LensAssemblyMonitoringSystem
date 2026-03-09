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

bool ConfigService::UploadConfigToServer(const std::string& requestId) {
    std::string configContent;
    if (!FileUtils::ReadFileContent(settings_->configFilePath, configContent)) {
        return false;
    }

    json request;
    request["RequestId"] = requestId;
    request["ConfigContent"] = configContent;

    json response;
    return httpClient_->Post(AgentConstants::ENDPOINT_UPLOAD_CONFIG, request, response);
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