#include "../include/services/RegistrationService.h"
#include "../include/services/LogService.h"
#include "../include/common/Constants.h"
#include "../include/utilities/NetworkUtils.h"
#include "../include/utilities/FileUtils.h"
#include "../include/monitoring/ConfigManager.h"
#include <filesystem>

namespace fs = std::filesystem;

/*
 * RegistrationService.cpp
 * Implementation of registration functionality
 * Follows SRP - handles ONLY registration logic
 */

RegistrationService::RegistrationService() {
}

RegistrationService::~RegistrationService() {
}

bool RegistrationService::RegisterWithServer(AgentSettings* settings, HttpClient* client) {
    if (settings == NULL || client == NULL) {
        return false;
    }

    json request = BuildRegistrationRequest(settings);
    json response;

    bool success = client->Post(AgentConstants::ENDPOINT_REGISTER, request, response);
    if (!success) {
        return false;
    }

    int mcId = 0;
    if (ParseRegistrationResponse(response, &mcId)) {
        settings->mcId = mcId;
        return true;
    }

    return false;
}

json RegistrationService::BuildRegistrationRequest(AgentSettings* settings) {
    json request;
    request["lineNumber"] = settings->lineNumber;
    request["mcNumber"] = settings->mcNumber;

    // Use the IP address stored in settings (detected in main.cpp)
    // instead of trying to detect it again (which fails if Winsock isn't ready)
    if (settings->ipAddress.empty()) {
        request["ipAddress"] = NetworkUtils::GetIPAddress(); // Fallback
    }
    else {
        request["ipAddress"] = settings->ipAddress;
    }

    request["configFilePath"] = settings->configFilePath;
    request["logFolderPath"] = settings->logFolderPath;
    request["modelFolderPath"] = settings->modelFolderPath;
    request["modelVersion"] = settings->modelVersion;

    std::string exeName = NetworkUtils::ConvertWStringToString(settings->exeName);
    request["exeName"] = exeName;

    // Build and send log structure JSON if log folder exists
    if (!settings->logFolderPath.empty() && fs::exists(settings->logFolderPath)) {
        fs::path rootPath(settings->logFolderPath);
        json structure = LogService::BuildDirectoryTree(rootPath, rootPath);
        request["logStructureJson"] = structure.dump();
    }

    // --- Send config content + current model during registration ---
    // Read config.ini content and extract current model name
    std::string configContent;
    if (FileUtils::ReadFileContent(settings->configFilePath, configContent)) {
        request["configContent"] = configContent;

        // Parse [current_model] section -> model= key
        ConfigManager tempCfg;
        std::string currentModel = tempCfg.GetCurrentModel(configContent);
        if (!currentModel.empty()) {
            request["currentModelName"] = currentModel;
        }
    }

    // Read model folder list so server has immediate data on registration
    if (!settings->modelFolderPath.empty() && fs::exists(settings->modelFolderPath)) {
        json modelArray = json::array();
        for (const auto& entry : fs::directory_iterator(settings->modelFolderPath)) {
            if (entry.is_directory()) {
                std::string folderName = entry.path().filename().string();
                if (folderName != "temp" && folderName != "." && folderName != "..") {
                    json modelInfo;
                    modelInfo["ModelName"] = folderName;
                    modelInfo["ModelPath"] = entry.path().string();
                    modelInfo["IsCurrent"] = false; // Will be set below
                    modelArray.push_back(modelInfo);
                }
            }
        }
        // Mark the current model
        if (request.contains("currentModelName")) {
            std::string curName = request["currentModelName"].get<std::string>();
            for (auto& m : modelArray) {
                if (m["ModelName"].get<std::string>() == curName) {
                    m["IsCurrent"] = true;
                }
            }
        }
        request["models"] = modelArray;
    }

    return request;
}

bool RegistrationService::ParseRegistrationResponse(const json& response, int* mcId) {
    if (mcId == NULL) {
        return false;
    }

    if (response.contains("success") && response["success"].get<bool>()) {
        if (response.contains("mcId")) {
            *mcId = response["mcId"].get<int>();
            return true;
        }
    }

    return false;
}