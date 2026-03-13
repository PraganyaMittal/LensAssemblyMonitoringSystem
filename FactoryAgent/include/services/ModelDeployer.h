#ifndef MODEL_DEPLOYER_H
#define MODEL_DEPLOYER_H

/*
 * ModelDeployer.h
 * Handles atomic model deployment:
 * Download → Checksum Verify → Extract to Staging → Rename-Swap → Rollback on failure
 *
 * Single Responsibility: Safe model deployment with rollback capability.
 * Used by the Command Worker thread only.
 */

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
    std::string expectedChecksum;  // SHA-256 hex from server
    bool applyOnUpload;

    DeployRequest() : applyOnUpload(false) {}
};

struct DeployResult {
    bool success;
    std::string agentChecksum;  // SHA-256 hex computed by agent
    std::string errorMessage;
    std::string extractPath;    // Where the model was extracted

    DeployResult() : success(false) {}
};

}} // namespace FactoryAgent::Models

class ModelDeployer {
public:
    ModelDeployer(AgentSettings* settings, HttpClient* client);
    ~ModelDeployer();

    // Main deployment method — called by CommandWorker thread
    DeployResult DeployModel(const DeployRequest& request);

    // Compute SHA-256 of a file
    static std::string ComputeSHA256(const std::string& filePath);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;
    std::mutex deployMutex_;  // Only one deployment at a time

    // Internal steps
    bool DownloadToTemp(const std::string& url, const std::string& tempPath);
    bool ExtractToStaging(const std::string& zipPath, const std::string& stagingDir);
    bool AtomicSwap(const std::string& stagingDir, const std::string& targetDir);
    bool Rollback(const std::string& backupDir, const std::string& targetDir);
    std::string GetTimestamp();

    ModelDeployer(const ModelDeployer&) = delete;
    ModelDeployer& operator=(const ModelDeployer&) = delete;
};

#endif // MODEL_DEPLOYER_H
