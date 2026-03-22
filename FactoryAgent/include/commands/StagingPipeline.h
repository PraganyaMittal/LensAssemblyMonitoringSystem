#pragma once

#include "common/Types.h"
#include "json/json.hpp"
#include <string>
#include <functional>

using json = nlohmann::json;

class HttpClient;
class PipeClient;

// Describes a staging operation (download/copy → hash → extract → stage → notify)
struct StagingRequest {
    std::string downloadUrl;      // URL to download from (empty for rollback/local copy)
    std::string localSourcePath;  // Local file/folder to copy from (for DeployLAI or rollback)
    std::string fileHash;         // Expected SHA-256 hash (empty to skip verification)
    std::string version;          // Version string for logging/notifications
    std::string installDir;       // Base install directory
    std::string targetSubdir;     // e.g. "update\\Bundle\\" or "update\\LAI\\"
    std::string notifyType;       // e.g. "UpdateBundle", "RollbackLAI"
    bool isRollback = false;      // true: copy folder contents from localSourcePath
    bool isLocalCopy = false;     // true: copy file from localSourcePath (e.g. DeployLAI shared path)
    bool extractAfterCopy = true; // true: extract zip after download/copy
    std::string backupSubdir;     // e.g. "backup\\Bundle\\" (for rollback source)
    std::string logPrefix;        // e.g. "[UpdateBundle]" for log messages
};

// Encapsulates the shared download → hash → extract → stage → notify pipeline
class StagingPipeline {
public:
    StagingPipeline(HttpClient* httpClient, PipeClient* pipeClient);

    // Execute the staging pipeline. Calls progressCb to report intermediate status.
    // Returns the final CommandResult.
    CommandResult Execute(int commandId, const StagingRequest& req,
        std::function<void(int, const CommandResult&)> progressCb);

private:
    HttpClient* httpClient_;
    PipeClient* pipeClient_;

    void NotifyAndWriteMarker(const StagingRequest& req);
};
