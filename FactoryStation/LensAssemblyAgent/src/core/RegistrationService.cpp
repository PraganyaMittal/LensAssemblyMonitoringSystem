#include "core/RegistrationService.h"
#include "logs/LogService.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "utilities/FileUtils.h"
#include "core/ConfigManager.h"
#include <filesystem>

namespace fs = std::filesystem;



RegistrationService::RegistrationService() {
}

RegistrationService::~RegistrationService() {
}

bool RegistrationService::RegisterWithServer(AgentSettings* settings, RestClient* client, std::string& errorMessage) {
    errorMessage = "";
    if (settings == NULL || client == NULL) {
        return false;
    }

    json request = BuildRegistrationRequest(settings);
    json response;

    bool success = client->Post(AgentConstants::ENDPOINT_REGISTER, request, response);
    if (!success) {
        errorMessage = "Network error: Failed to reach the server at " + NetworkUtils::ConvertWStringToString(settings->serverUrl);
        return false;
    }

    int mcId = 0;
    if (ParseRegistrationResponse(response, &mcId, settings, errorMessage)) {
        settings->mcId = mcId;
        return true;
    }

    return false;
}

bool RegistrationService::FetchSettingsFromServer(AgentSettings* settings, RestClient* client, std::string& errorMessage) {
    errorMessage = "";
    if (settings == NULL || client == NULL || settings->mcId <= 0) {
        return false;
    }

    std::wstring endpoint = AgentConstants::ENDPOINT_GET_SETTINGS;
    endpoint += L"/" + std::to_wstring(settings->mcId);

    json response;
    bool success = client->Get(endpoint.c_str(), response);

    if (!success) {
        errorMessage = "Network error: Failed to fetch settings from " + NetworkUtils::ConvertWStringToString(settings->serverUrl);
        return false;
    }

    if (response.contains("success") && response["success"].get<bool>() && response.contains("data")) {
        auto data = response["data"];
        
        if (data.contains("lineNumber") && !data["lineNumber"].is_null())
            settings->lineNumber = data["lineNumber"].get<int>();

        if (data.contains("mcNumber") && !data["mcNumber"].is_null())
            settings->mcNumber = data["mcNumber"].get<int>();

        if (data.contains("configFilePath") && !data["configFilePath"].is_null())
            settings->configFilePath = data["configFilePath"].get<std::string>();

        if (data.contains("logFolderPath") && !data["logFolderPath"].is_null())
            settings->logFolderPath = data["logFolderPath"].get<std::string>();

        if (data.contains("modelFolderPath") && !data["modelFolderPath"].is_null())
            settings->modelFolderPath = data["modelFolderPath"].get<std::string>();

        if (data.contains("generationNo") && !data["generationNo"].is_null())
            settings->generationNo = data["generationNo"].get<std::string>();



        return true;
    }
    
    errorMessage = "Server failed to return valid agent settings.";
    return false;
}

json RegistrationService::BuildRegistrationRequest(AgentSettings* settings) {
    json request;
    request["lineNumber"] = settings->lineNumber;
    request["mcNumber"] = settings->mcNumber;

    
    
    if (settings->ipAddress.empty()) {
        request["ipAddress"] = NetworkUtils::GetIPAddress(); 
    }
    else {
        request["ipAddress"] = settings->ipAddress;
    }

    request["configFilePath"] = settings->configFilePath;
    request["logFolderPath"] = settings->logFolderPath;
    request["modelFolderPath"] = settings->modelFolderPath;
    request["generationNo"] = settings->generationNo;


    std::string exeName = NetworkUtils::ConvertWStringToString(settings->exeName);
    request["exeName"] = exeName;

    
    if (!settings->logFolderPath.empty() && fs::exists(settings->logFolderPath)) {
        fs::path rootPath(settings->logFolderPath);
        json structure = LogService::BuildDirectoryTree(rootPath, rootPath);
        request["logStructureJson"] = structure.dump();
    }

    
    
    std::string configContent;
    if (FileUtils::ReadFileContent(settings->configFilePath, configContent)) {
        request["configContent"] = configContent;

        
        ConfigManager tempCfg;
        std::string currentModel = tempCfg.GetCurrentModel(configContent);
        if (!currentModel.empty()) {
            request["currentModelName"] = currentModel;
        }
    }

    
    if (!settings->modelFolderPath.empty() && fs::exists(settings->modelFolderPath)) {
        json modelArray = json::array();
        for (const auto& entry : fs::directory_iterator(settings->modelFolderPath)) {
            if (entry.is_directory()) {
                std::string folderName = entry.path().filename().string();
                if (folderName != "temp" && folderName != "." && folderName != "..") {
                    json modelInfo;
                    modelInfo["ModelName"] = folderName;
                    modelInfo["ModelPath"] = entry.path().string();
                    modelInfo["IsCurrent"] = false; 
                    modelArray.push_back(modelInfo);
                }
            }
        }
        
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

bool RegistrationService::ParseRegistrationResponse(const json& response, int* mcId, AgentSettings* settings, std::string& errorMessage) {
    if (mcId == NULL || settings == NULL) {
        return false;
    }

    if (response.contains("success") && response["success"].get<bool>()) {
        if (response.contains("mcId")) {
            *mcId = response["mcId"].get<int>();

            if (response.contains("lineNumber") && !response["lineNumber"].is_null()) {
                settings->lineNumber = response["lineNumber"].get<int>();
            }

            if (response.contains("mcNumber") && !response["mcNumber"].is_null()) {
                settings->mcNumber = response["mcNumber"].get<int>();
            }

            return true;
        }
    } else {
        if (response.contains("message") && response["message"].is_string()) {
            errorMessage = response["message"].get<std::string>();
        } else {
            errorMessage = "Server returned an unknown error during registration.";
        }
    }

    return false;
}