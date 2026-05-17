#include "core/ConfigService.h"
#include "network/RestClient.h"
#include "utilities/FileUtils.h"
#include "common/Constants.h"
#include "core/ConfigManager.h"

ConfigService::ConfigService(AgentSettings* settings, RestClient* client, ConfigManager* configMgr) {
    settings_ = settings;
    httpClient_ = client;
    configManager_ = configMgr;
}

ConfigService::~ConfigService() {
}

bool ConfigService::UploadConfigToServer(const std::string& requestId) {
    std::string configContent;
    std::string errorMessage;
    if (!FileUtils::ReadFileContent(settings_->configFilePath, configContent)) {
        errorMessage = "Configuration file not found on the local PC.";
    }

    json request;
    request["RequestId"] = requestId;
    if (!errorMessage.empty()) {
        request["ErrorMessage"] = errorMessage;
    } else {
        request["ConfigContent"] = configContent;
    }

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