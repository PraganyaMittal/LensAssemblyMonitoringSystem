#ifndef MODEL_DEPLOYER_H
#define MODEL_DEPLOYER_H



#include "../common/Types.h"
#include "../../third_party/json/json.hpp"
#include <string>
#include <mutex>

using json = nlohmann::json;

class HttpClient;

namespace FactoryAgent { namespace Models {

struct DeployRequest {
    std::string downloadUrl;
    std::string modelName;
    std::string expectedChecksum;  
    bool applyOnUpload;

    DeployRequest() : applyOnUpload(false) {}
};

struct DeployResult {
    bool success;
    std::string agentChecksum;  
    std::string errorMessage;
    std::string extractPath;    

    DeployResult() : success(false) {}
};

}} 

class ModelDeployer {
public:
    ModelDeployer(AgentSettings* settings, HttpClient* client);
    ~ModelDeployer();

    
    DeployResult DeployModel(const DeployRequest& request);

    
    static std::string ComputeSHA256(const std::string& filePath);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    std::mutex deployMutex_;  

    
    bool DownloadToTemp(const std::string& url, const std::string& tempPath);
    bool ExtractToStaging(const std::string& zipPath, const std::string& stagingDir);
    bool AtomicSwap(const std::string& stagingDir, const std::string& targetDir);
    bool Rollback(const std::string& backupDir, const std::string& targetDir);
    std::string GetTimestamp();

    ModelDeployer(const ModelDeployer&) = delete;
    ModelDeployer& operator=(const ModelDeployer&) = delete;
};

#endif 
