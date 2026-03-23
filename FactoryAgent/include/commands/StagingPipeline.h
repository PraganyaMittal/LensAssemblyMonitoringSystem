#pragma once

#include "common/Types.h"
#include "json/json.hpp"
#include <string>
#include <functional>

using json = nlohmann::json;

class HttpClient;
class PipeClient;


struct StagingRequest {
    std::string downloadUrl;      
    std::string localSourcePath;  
    std::string fileHash;         
    std::string version;          
    std::string installDir;       
    std::string targetSubdir;     
    std::string notifyType;       
    bool isRollback = false;      
    bool isLocalCopy = false;     
    bool extractAfterCopy = true; 
    std::string backupSubdir;     
    std::string logPrefix;        
};


class StagingPipeline {
public:
    StagingPipeline(HttpClient* httpClient, PipeClient* pipeClient);

    
    
    CommandResult Execute(int commandId, const StagingRequest& req,
        std::function<void(int, const CommandResult&)> progressCb);

private:
    HttpClient* httpClient_;
    PipeClient* pipeClient_;

    void NotifyAndWriteMarker(const StagingRequest& req);
};
