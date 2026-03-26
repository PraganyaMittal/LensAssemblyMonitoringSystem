#include "commands/StagingPipeline.h"
#include "network/HttpClient.h"
#include "network/PipeClient.h"
#include "utilities/FileUtils.h"
#include "utilities/ZipUtils.h"
#include "utilities/CryptoUtils.h"
#include "common/Constants.h"
#include "core/Logger.h"
#include <fstream>
#include <windows.h>

static void WriteStagingMarker(const std::string& installDir, const std::string& payload) {
    std::string markerPath = installDir + ".update_pending";
    std::ofstream marker(markerPath, std::ios::trunc);
    if (marker.is_open()) {
        marker << payload;
        marker.close();
        Logger::Info("[Staging] Wrote update marker: " + markerPath);
    } else {
        Logger::Warning("[Staging] Could not write update marker: " + markerPath);
    }
}

StagingPipeline::StagingPipeline(HttpClient* httpClient, PipeClient* pipeClient)
    : httpClient_(httpClient), pipeClient_(pipeClient) {
}

CommandResult StagingPipeline::Execute(int commandId, const StagingRequest& req,
    std::function<void(int, const CommandResult&)> progressCb) {

    CommandResult result;
    result.commandId = commandId;
    result.success = false;
    result.status = AgentConstants::STATUS_FAILED;

    std::string targetDir = req.installDir + req.targetSubdir;
    FileUtils::CreateFolder(targetDir);

    
    std::string packagePath;

    if (req.isRollback) {
        
        std::string backupDir = req.installDir + req.backupSubdir;
        if (!FileUtils::FolderExists(backupDir)) {
            result.errorMessage = "Backup directory not found: " + backupDir;
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            return result;
        }

        if (!FileUtils::FolderHasFiles(backupDir)) {
            result.errorMessage = "Backup directory is empty (no previous version to rollback to): " + backupDir;
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            return result;
        }

        result.status = AgentConstants::STATUS_INSTALLING;
        result.resultData = "Restoring from backup";
        if (progressCb) progressCb(commandId, result);

        if (!FileUtils::CopyFolderContents(backupDir, targetDir)) {
            result.errorMessage = "Failed to restore backup files";
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            return result;
        }

        
        result.success = true;
        result.status = AgentConstants::STATUS_COMPLETED;
        result.resultData = req.notifyType + " staged successfully";
        Logger::Info(req.logPrefix + " Backup restored to staging");
        NotifyAndWriteMarker(req);
        return result;

    } else if (req.isLocalCopy) {
        
        if (!FileUtils::FileExists(req.localSourcePath)) {
            result.errorMessage = "Package not found at: " + req.localSourcePath;
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            return result;
        }

        result.status = AgentConstants::STATUS_DOWNLOADING;
        result.resultData = "Copying v" + req.version + " from shared path";
        if (progressCb) progressCb(commandId, result);

        packagePath = targetDir + FileUtils::GetFileName(req.localSourcePath);
        if (!CopyFileA(req.localSourcePath.c_str(), packagePath.c_str(), FALSE)) {
            result.errorMessage = "Failed to copy package from shared path";
            Logger::Error(req.logPrefix + " CopyFile failed: " + req.localSourcePath);
            return result;
        }

    } else {
        
        if (req.downloadUrl.empty()) {
            result.errorMessage = "Missing downloadUrl";
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            return result;
        }

        std::string tempDir = req.installDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
        FileUtils::CreateFolder(tempDir);
        packagePath = tempDir + "pkg_" + req.version + ".zip";

        result.status = AgentConstants::STATUS_DOWNLOADING;
        result.resultData = "Downloading v" + req.version;
        if (progressCb) progressCb(commandId, result);

        Logger::Info(req.logPrefix + " Downloading from: " + req.downloadUrl);
        if (!httpClient_->DownloadFileResumable(req.downloadUrl, packagePath)) {
            result.errorMessage = "Failed to download package";
            Logger::Error(req.logPrefix + " Download failed");
            return result;
        }

        if (!FileUtils::FileExists(packagePath)) {
            result.errorMessage = "Downloaded file not found on disk";
            Logger::Error(req.logPrefix + " File not found after download: " + packagePath);
            return result;
        }
    }

    
    if (!req.fileHash.empty()) {
        std::string computed = CryptoUtils::ComputeFileSHA256(packagePath);
        std::string hL = req.fileHash, cL = computed;
        for (auto& c : hL) c = (char)tolower(c);
        for (auto& c : cL) c = (char)tolower(c);
        if (cL != hL) {
            result.errorMessage = "Hash mismatch! Expected: " + req.fileHash + " Got: " + computed;
            Logger::Error(req.logPrefix + " " + result.errorMessage);
            FileUtils::DeleteFile(packagePath);
            return result;
        }
        Logger::Info(req.logPrefix + " SHA-256 hash verified OK");
    }

    
    if (req.extractAfterCopy) {
        result.status = AgentConstants::STATUS_INSTALLING;
        result.resultData = "Installing v" + req.version;
        if (progressCb) progressCb(commandId, result);

        if (!ZipUtils::ExtractZip(packagePath, targetDir)) {
            result.errorMessage = "Failed to extract package";
            Logger::Error(req.logPrefix + " Extraction failed");
            return result;
        }

        FileUtils::DeleteFile(packagePath);
    }

    
    result.success = true;
    result.status = AgentConstants::STATUS_COMPLETED;
    result.resultData = req.notifyType + " v" + req.version + " staged successfully";
    Logger::Info(req.logPrefix + " v" + req.version + " staged");
    NotifyAndWriteMarker(req);
    return result;
}

void StagingPipeline::NotifyAndWriteMarker(const StagingRequest& req) {
    json payloadObj;
    payloadObj["type"] = req.notifyType;
    payloadObj["version"] = req.version;
    payloadObj["installDir"] = req.installDir;
    std::string notifyPayload = payloadObj.dump();

    WriteStagingMarker(req.installDir, notifyPayload);
    if (pipeClient_) {
        pipeClient_->NotifyUpdate(notifyPayload);
    }
}
