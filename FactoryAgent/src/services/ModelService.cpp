#include "../include/services/ModelService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/FileUtils.h"
#include "../include/utilities/ZipUtils.h"
#include "../include/common/Constants.h"
#include "../include/Utils/Logger.h"
#include <windows.h>

ModelService::ModelService(AgentSettings* settings, HttpClient* client, ConfigManager* configMgr) {
    settings_ = settings;
    httpClient_ = client;
    configManager_ = configMgr;
}

ModelService::~ModelService() {
}

std::vector<ModelInfo> ModelService::GetModelFolders() {
    std::vector<ModelInfo> models;

    if (!FileUtils::FolderExists(settings_->modelFolderPath)) {
        return models;
    }

    std::string searchPath = settings_->modelFolderPath + "\\*.*";
    WIN32_FIND_DATAA findData;
    HANDLE hFind = FindFirstFileA(searchPath.c_str(), &findData);

    if (hFind == INVALID_HANDLE_VALUE) {
        return models;
    }

    do {
        if ((findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
            strcmp(findData.cFileName, ".") != 0 &&
            strcmp(findData.cFileName, "..") != 0 &&
            strcmp(findData.cFileName, AgentConstants::TEMP_FOLDER_NAME) != 0) {

            ModelInfo info;
            info.modelName = findData.cFileName;
            info.modelPath = settings_->modelFolderPath + "\\" + info.modelName;
            info.isCurrent = false;

            models.push_back(info);
        }
    } while (FindNextFileA(hFind, &findData));

    FindClose(hFind);
    return models;
}

void ModelService::SyncModelsToServer() {
    std::vector<ModelInfo> models = GetModelFolders();

    std::string configContent;
    std::string currentModel;
    if (configManager_->ParseConfigFile(settings_->configFilePath, configContent)) {
        currentModel = configManager_->GetCurrentModel(configContent);
    }

    json modelArray = json::array();
    for (size_t i = 0; i < models.size(); i++) {
        json modelInfo;
        modelInfo["ModelName"] = models[i].modelName;
        modelInfo["ModelPath"] = models[i].modelPath;
        modelInfo["IsCurrent"] = (models[i].modelName == currentModel);
        modelArray.push_back(modelInfo);
    }

    json request;
    request["mcId"] = settings_->mcId;
    request["models"] = modelArray;

    json response;
    if (!httpClient_->Post(AgentConstants::ENDPOINT_SYNC_MODELS, request, response)) {
        FactoryAgent::Utils::Logger::Error("Failed to sync models to server.");
    }
}

bool ModelService::ChangeModel(const std::string& modelName) {
    std::string modelPath = settings_->modelFolderPath + "\\" + modelName;

    if (!FileUtils::FolderExists(modelPath)) {
        return false;
    }

    std::string configContent;
    if (!configManager_->ParseConfigFile(settings_->configFilePath, configContent)) {
        return false;
    }

    if (configManager_->UpdateCurrentModel(configContent, modelName, modelPath)) {
        if (configManager_->WriteConfigFile(settings_->configFilePath, configContent)) {
            return true;
        }
    }

    return false;
}

bool ModelService::UploadModelToServer(const json& data) {
    if (!data.contains("DownloadUrl") || !data.contains("ModelName")) {
        return false;
    }

    std::string downloadUrl = data["DownloadUrl"].get<std::string>();
    std::string modelName = data["ModelName"].get<std::string>();

    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    std::string tempDir = std::string(tempPath) + "FactoryAgentTemp";
    FileUtils::CreateFolder(tempDir);

    std::string tempZipPath = tempDir + "\\" + modelName + AgentConstants::ZIP_EXTENSION;

    if (httpClient_->DownloadFile(downloadUrl, tempZipPath)) {
        std::string extractPath = settings_->modelFolderPath + "\\" + modelName;

        if (FileUtils::FolderExists(extractPath)) {
            FileUtils::DeleteFolder(extractPath);
        }

        // Create the folder where we will extract the zip
        FileUtils::CreateFolder(extractPath);

        if (ZipUtils::ExtractZip(tempZipPath, extractPath)) {
            FileUtils::DeleteFile(tempZipPath);

            // REMOVED FLATTENING LOGIC AS REQUESTED
            // The zip content is extracted exactly as is.

            std::string configContent;
            if (configManager_->ParseConfigFile(settings_->configFilePath, configContent)) {

                // Check if ApplyOnUpload is true
                bool applyOnUpload = false;
                if (data.contains("ApplyOnUpload")) {
                    applyOnUpload = data["ApplyOnUpload"].get<bool>();
                }

                if (applyOnUpload) {
                    if (configManager_->UpdateCurrentModel(configContent, modelName, extractPath)) {
                        configManager_->WriteConfigFile(settings_->configFilePath, configContent);
                    }
                }
            }

            return true;
        }

        FileUtils::DeleteFile(tempZipPath);
    }

    return false;
}

bool ModelService::DeleteModel(const std::string& modelName) {
    std::string modelPath = settings_->modelFolderPath + "\\" + modelName;
    return FileUtils::DeleteFolder(modelPath);
}

bool ModelService::UploadModelToLibrary(const std::string& modelName, const std::string& uploadUrl) {
    std::string modelPath = settings_->modelFolderPath + "\\" + modelName;

    if (!FileUtils::FolderExists(modelPath)) {
        return false;
    }

    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    std::string tempDir = std::string(tempPath) + "FactoryAgentTemp";
    FileUtils::CreateFolder(tempDir);

    std::string tempZipPath = tempDir + "\\" + modelName + AgentConstants::ZIP_EXTENSION;

    // Use existing ZipUtils
    if (ZipUtils::CreateZip(modelPath, tempZipPath)) {
        if (FileUtils::FileExists(tempZipPath)) {
            json response;
            // Use the specific uploadUrl provided by server (converted to wstring)
            std::wstring wUploadUrl(uploadUrl.begin(), uploadUrl.end());
            bool success = httpClient_->UploadFile(wUploadUrl, tempZipPath, "file", response);

            FileUtils::DeleteFile(tempZipPath);

            return success;
        }
    }

    return false;
}