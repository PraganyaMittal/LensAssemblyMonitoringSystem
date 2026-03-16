#ifndef MODEL_SERVICE_H
#define MODEL_SERVICE_H



#include "common/Types.h"
#include "monitoring/ConfigManager.h"
#include "json/json.hpp"
#include <vector>

using json = nlohmann::json;

class HttpClient;

class ModelService {
public:
    ModelService(AgentSettings* settings, HttpClient* client, ConfigManager* configMgr);
    ~ModelService();

    std::vector<ModelInfo> GetModelFolders();
    void SyncModelsToServer();
    bool ChangeModel(const std::string& modelName);
    bool UploadModelToServer(const json& data);
    bool DeleteModel(const std::string& modelName);
    bool UploadModelToLibrary(const std::string& modelName, const std::string& uploadUrl);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    ConfigManager* configManager_;

    ModelService(const ModelService&);
    ModelService& operator=(const ModelService&);
};

#endif