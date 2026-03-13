#include "../include/services/CommandExecutor.h"
#include "../include/services/ConfigService.h"
#include "../include/services/ModelService.h"
#include "../include/services/PipeClient.h"
#include "../include/services/SyncWorker.h"
#include "../include/services/ModelDeployer.h"
#include "../include/network/HttpClient.h"
#include "../include/common/Constants.h"
#include "../include/utilities/ZipUtils.h"
#include "../include/utilities/FileUtils.h"
#include "../include/Utils/Logger.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

// Compute SHA-256 hash of a file using Windows BCrypt API
static std::string ComputeFileSHA256(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) return "";

    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    std::string result;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";

    DWORD hashObjSize = 0, dataSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashObject(hashObjSize);
    DWORD hashSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashValue(hashSize);

    if (BCryptCreateHash(hAlg, &hHash, hashObject.data(), hashObjSize, NULL, 0, 0) == 0) {
        char buffer[8192];
        while (file.read(buffer, sizeof(buffer)) || file.gcount() > 0) {
            BCryptHashData(hHash, (PUCHAR)buffer, (ULONG)file.gcount(), 0);
            if (file.eof()) break;
        }

        if (BCryptFinishHash(hHash, hashValue.data(), hashSize, 0) == 0) {
            std::ostringstream oss;
            for (DWORD i = 0; i < hashSize; i++) {
                oss << std::hex << std::setfill('0') << std::setw(2) << (int)hashValue[i];
            }
            result = oss.str();
        }
        BCryptDestroyHash(hHash);
    }

    BCryptCloseAlgorithmProvider(hAlg, 0);
    return result;
}

// Get directory of the running executable
static std::string GetExeDirectory() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string dir(path);
    size_t pos = dir.find_last_of("\\/");
    return (pos != std::string::npos) ? dir.substr(0, pos + 1) : dir;
}

CommandExecutor::CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc, PipeClient* pipeCli)
    : httpClient_(client), configService_(configSvc), modelService_(modelSvc),
      pipeClient_(pipeCli), syncWorker_(nullptr), modelDeployer_(nullptr) {
}

CommandExecutor::~CommandExecutor() {
}

void CommandExecutor::ProcessCommands(const json& commands) {
    if (!commands.is_array()) {
        return;
    }

    size_t count = commands.size();
    for (size_t i = 0; i < count; i++) {
        ExecuteCommand(commands[i]);
    }
}

bool CommandExecutor::ExecuteCommand(const json& command) {
    if (!command.contains("commandId") && !command.contains("commandType")) {
        return false;
    }

    int commandId = 0;
    if (command.contains("commandId")) {
        // Handle both int and string commandId (SignalR sends strings)
        if (command["commandId"].is_number()) {
            commandId = command["commandId"].get<int>();
        } else if (command["commandId"].is_string()) {
            try { commandId = std::stoi(command["commandId"].get<std::string>()); }
            catch (...) { commandId = 0; }
        }
    }

    std::string commandType = command.contains("commandType") 
        ? command["commandType"].get<std::string>() : "";


    CommandResult result;
    result.commandId = commandId;
    result.success = false;
    result.status = AgentConstants::STATUS_FAILED;

    FactoryAgent::Utils::Logger::Info(
        "[CommandExecutor] Executing command: " + commandType + " (ID: " + std::to_string(commandId) + ")");

    if (commandType == AgentConstants::COMMAND_UPDATE_CONFIG) {
        if (command.contains("commandData")) {
            std::string configContent = command["commandData"].get<std::string>();
            if (configService_->ApplyConfigFromServer(configContent)) {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPLOAD_CONFIG) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("RequestId")) {
                    std::string requestId = data["RequestId"].get<std::string>();
                    if (configService_->UploadConfigToServer(requestId)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_CHANGE_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    if (modelService_->ChangeModel(modelName)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        // Signal sync worker instead of direct sync calls
                        if (syncWorker_) {
                            syncWorker_->SignalModelsDirty();
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPLOAD_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                // Phase 2: Use ModelDeployer for atomic deployment
                if (modelDeployer_ && data.contains("DownloadUrl") && data.contains("ModelName")) {
                    DeployRequest req;
                    req.downloadUrl = data["DownloadUrl"].get<std::string>();
                    req.modelName = data["ModelName"].get<std::string>();
                    if (data.contains("ExpectedChecksum")) {
                        req.expectedChecksum = data["ExpectedChecksum"].get<std::string>();
                    }
                    if (data.contains("ApplyOnUpload")) {
                        req.applyOnUpload = data["ApplyOnUpload"].get<bool>();
                    }

                    DeployResult deployResult = modelDeployer_->DeployModel(req);

                    if (deployResult.success) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        result.resultData = "Checksum: " + deployResult.agentChecksum;

                        // If apply on upload, update the config
                        if (req.applyOnUpload && configService_) {
                            modelService_->ChangeModel(req.modelName);
                        }

                        // Signal sync worker
                        if (syncWorker_) {
                            syncWorker_->SignalModelsDirty();
                        }
                    } else {
                        result.errorMessage = deployResult.errorMessage;
                    }
                } else {
                    // Fallback to legacy method if deployer not available
                    if (modelService_->UploadModelToServer(data)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        if (syncWorker_) syncWorker_->SignalModelsDirty();
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_DELETE_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    if (modelService_->DeleteModel(modelName)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        // Signal sync worker
                        if (syncWorker_) syncWorker_->SignalModelsDirty();
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == "UploadModelToLib") {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName") && data.contains("UploadUrl")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    std::string uploadUrl = data["UploadUrl"].get<std::string>();
                    if (modelService_->UploadModelToLibrary(modelName, uploadUrl)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    // =========================================================================
    // UpdateBundle - Unified update handler (replaces separate UpdateAgent/UpdateLAI)
    // Downloads one zip with component folders, extracts to correct staging dirs.
    // Zip folders: FactoryAgent/, FactoryService/, AutoUpdater/ -> update/Core/
    //              LAI/ -> update/LAI/
    // Status: Downloading -> Installing -> Completed / Failed
    // =========================================================================
    else if (commandType == AgentConstants::COMMAND_UPDATE_BUNDLE) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                std::string downloadUrl = data.value("downloadUrl", "");
                std::string fileHash    = data.value("fileHash", "");
                std::string version     = data.value("version", "");
                std::string installDir  = data.value("installDir", std::string(AgentConstants::DEFAULT_INSTALL_DIR));

                if (downloadUrl.empty()) {
                    result.errorMessage = "Missing downloadUrl in commandData";
                    FactoryAgent::Utils::Logger::Error("[UpdateBundle] Missing downloadUrl in commandData");
                }
                else {
                    // Build directory paths aligned with FactoryService/AutoUpdater layout
                    // Staging:  C:/Factory_Dirs/update/Core/  and  C:/Factory_Dirs/update/LAI/
                    // Backup:   C:/Factory_Dirs/backup/Core/  and  C:/Factory_Dirs/backup/LAI/
                    std::string updateCoreDir = installDir + AgentConstants::UPDATE_CORE_SUBDIR;
                    std::string updateLaiDir  = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                    std::string backupCoreDir = installDir + AgentConstants::BACKUP_CORE_SUBDIR;
                    std::string backupLaiDir  = installDir + AgentConstants::BACKUP_LAI_SUBDIR;
                    std::string tempDir       = installDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
                    std::string tempZipPath   = tempDir + "bundle_" + version + ".zip";
                    std::string tempExtractDir = tempDir + "bundle_" + version + "\\";

                    FactoryAgent::Utils::Logger::Info("[UpdateBundle] Staging dirs: Core=" + updateCoreDir + " LAI=" + updateLaiDir);

                    // Ensure all directories exist
                    if (!FileUtils::CreateFolder(updateCoreDir) ||
                        !FileUtils::CreateFolder(updateLaiDir) ||
                        !FileUtils::CreateFolder(backupCoreDir) ||
                        !FileUtils::CreateFolder(backupLaiDir) ||
                        !FileUtils::CreateFolder(tempDir)) {
                        result.errorMessage = "Failed to create staging directories under: " + installDir;
                        FactoryAgent::Utils::Logger::Error("[UpdateBundle] " + result.errorMessage);
                    }

                    if (result.errorMessage.empty()) {
                        // Download the bundle zip
                        result.status = AgentConstants::STATUS_DOWNLOADING;
                        result.resultData = "Downloading Bundle v" + version;
                        SendCommandResult(commandId, result);
                        FactoryAgent::Utils::Logger::Info("[UpdateBundle] Downloading from: " + downloadUrl);

                        if (!httpClient_->DownloadFileResumable(downloadUrl, tempZipPath)) {
                            result.errorMessage = "Failed to download bundle package";
                            FactoryAgent::Utils::Logger::Error("[UpdateBundle] Download failed for: " + downloadUrl);
                        }
                        else if (!FileUtils::FileExists(tempZipPath)) {
                            result.errorMessage = "Downloaded file not found on disk";
                            FactoryAgent::Utils::Logger::Error("[UpdateBundle] File not found after download: " + tempZipPath);
                        }
                        else if (!fileHash.empty()) {
                            // Verify SHA-256 hash
                            std::string computed = ComputeFileSHA256(tempZipPath);
                            std::string hL = fileHash, cL = computed;
                            for (auto& c : hL) c = (char)tolower(c);
                            for (auto& c : cL) c = (char)tolower(c);
                            if (cL != hL) {
                                result.errorMessage = "Hash mismatch! Expected: " + fileHash + " Got: " + computed;
                                FactoryAgent::Utils::Logger::Error("[UpdateBundle] " + result.errorMessage);
                                FileUtils::DeleteFile(tempZipPath);
                            } else {
                                FactoryAgent::Utils::Logger::Info("[UpdateBundle] SHA-256 hash verified OK");
                            }
                        }
                    }

                    if (result.errorMessage.empty()) {
                        result.status = AgentConstants::STATUS_INSTALLING;
                        result.resultData = "Installing Bundle v" + version;
                        SendCommandResult(commandId, result);

                        // Extract zip to temp directory first
                        if (FileUtils::FolderExists(tempExtractDir)) {
                            FileUtils::DeleteFolder(tempExtractDir);
                        }
                        FileUtils::CreateFolder(tempExtractDir);

                        if (!ZipUtils::ExtractZip(tempZipPath, tempExtractDir)) {
                            result.errorMessage = "Failed to extract bundle zip";
                            FactoryAgent::Utils::Logger::Error("[UpdateBundle] Extraction failed to: " + tempExtractDir);
                        }
                        else {
                            // Detect single wrapper directory (e.g., zip contains update_v2/FactoryAgent/...)
                            // If extracted dir has exactly one subdirectory and no files, use it as the effective root
                            std::string effectiveRoot = tempExtractDir;
                            {
                                WIN32_FIND_DATAA fd;
                                std::string searchPattern = tempExtractDir + "*";
                                HANDLE hFind = FindFirstFileA(searchPattern.c_str(), &fd);
                                if (hFind != INVALID_HANDLE_VALUE) {
                                    int dirCount = 0;
                                    int fileCount = 0;
                                    std::string singleDir;
                                    do {
                                        std::string name = fd.cFileName;
                                        if (name == "." || name == "..") continue;
                                        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
                                            dirCount++;
                                            singleDir = name;
                                        } else {
                                            fileCount++;
                                        }
                                    } while (FindNextFileA(hFind, &fd));
                                    FindClose(hFind);

                                    if (dirCount == 1 && fileCount == 0) {
                                        effectiveRoot = tempExtractDir + singleDir + "\\";
                                        FactoryAgent::Utils::Logger::Info("[UpdateBundle] Detected wrapper directory: " + singleDir + ", using as effective root");
                                    }
                                }
                            }

                            // Map extracted folders to staging directories:
                            // FactoryAgent/ + FactoryService/ + AutoUpdater/ -> update/Core/
                            // LAI/ -> update/LAI/
                            bool copyOk = true;
                            std::vector<std::string> coreComponents = {"FactoryAgent", "FactoryService", "AutoUpdater"};

                            for (const auto& component : coreComponents) {
                                std::string srcDir = effectiveRoot + component + "\\";
                                if (FileUtils::FolderExists(srcDir)) {
                                    FactoryAgent::Utils::Logger::Info("[UpdateBundle] Copying " + component + " to update/Core/");
                                    // Copy all files from component folder to update/Core/
                                    if (!FileUtils::CopyFolderContents(srcDir, updateCoreDir)) {
                                        result.errorMessage = "Failed to copy " + component + " to staging";
                                        FactoryAgent::Utils::Logger::Error("[UpdateBundle] " + result.errorMessage);
                                        copyOk = false;
                                        break;
                                    }
                                }
                            }

                            if (copyOk) {
                                std::string laiSrc = effectiveRoot + "LAI\\";
                                if (FileUtils::FolderExists(laiSrc)) {
                                    FactoryAgent::Utils::Logger::Info("[UpdateBundle] Copying LAI to update/LAI/");
                                    if (!FileUtils::CopyFolderContents(laiSrc, updateLaiDir)) {
                                        result.errorMessage = "Failed to copy LAI to staging";
                                        FactoryAgent::Utils::Logger::Error("[UpdateBundle] " + result.errorMessage);
                                        copyOk = false;
                                    }
                                }
                            }

                            if (copyOk) {
                                // Clean up temp files
                                FileUtils::DeleteFile(tempZipPath);
                                FileUtils::DeleteFolder(tempExtractDir);

                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "Bundle v" + version + " staged successfully";
                                FactoryAgent::Utils::Logger::Info("[UpdateBundle] v" + version + " deployed to staging directories");

                                // Notify FactoryService about staged update
                                if (pipeClient_) {
                                    std::string updatePayload = "{\"type\":\"UpdateBundle\",\"version\":\"" + version + "\"}";
                                    if (!pipeClient_->NotifyUpdate(updatePayload)) {
                                        FactoryAgent::Utils::Logger::Warning("[UpdateBundle] Failed to notify Service. Update staged but not triggered.");
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("UpdateBundle error: ") + ex.what();
                FactoryAgent::Utils::Logger::Error("[UpdateBundle] Exception: " + result.errorMessage);
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
        if (command.contains("commandData")) {
            try {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
                result.resultData = "Agent settings updated. Restarting agent to apply changes...";
                
                // Send result back before dying
                SendCommandResult(commandId, result);
                
                // Sleep briefly to allow network flush, then restart
                Sleep(1000);
                
                // Re-launch the agent executable
                char exePath[MAX_PATH];
                GetModuleFileNameA(NULL, exePath, MAX_PATH);
                ShellExecuteA(NULL, "open", exePath, NULL, NULL, SW_SHOWDEFAULT);

                exit(0);
            }
            catch (const std::exception& ex) {
                result.success = false;
                result.errorMessage = std::string("Error accepting settings update: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_RESET_AGENT) {
        try {
            // 1. Try to delete the config file
            bool deleted = (std::remove("agent_config.json") == 0);

            // 2. If delete failed, try to wipe the content so it can't be used again
            if (!deleted) {
                std::ofstream wiper("agent_config.json", std::ofstream::trunc);
                if (wiper.is_open()) {
                    wiper << "{}";
                    wiper.close();
                }
            }

            result.success = true;
            result.status = AgentConstants::STATUS_COMPLETED;
            result.resultData = "Agent reset command received. Shutting down.";

            // 3. Send result to server immediately
            SendCommandResult(commandId, result);

            // 4. FATAL EXIT: Sleep briefly to flush network, then KILL the process
            Sleep(1000);
            exit(0);
        }
        catch (const std::exception&) {
            // Even if an error occurs, we must die to stop the loop
            result.success = false;
            SendCommandResult(commandId, result);
            Sleep(1000);
            exit(0);
        }
    }
    // =============================================================================
    // DeployBundle — Dispatched by LineDeploymentOrchestratorService
    // Same logic as UpdateBundle with the newer orchestrator command name
    // =============================================================================
    else if (commandType == AgentConstants::COMMAND_DEPLOY_BUNDLE) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                std::string downloadUrl = data.value("downloadUrl", "");
                std::string fileHash    = data.value("fileHash", "");
                std::string version     = data.value("version", "");
                std::string installDir  = data.value("installDir", std::string(AgentConstants::DEFAULT_INSTALL_DIR));

                if (downloadUrl.empty()) {
                    result.errorMessage = "Missing downloadUrl in DeployBundle commandData";
                    FactoryAgent::Utils::Logger::Error("[DeployBundle] " + result.errorMessage);
                }
                else {
                    std::string updateCoreDir = installDir + AgentConstants::UPDATE_CORE_SUBDIR;
                    std::string tempDir       = installDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
                    std::string tempZipPath   = tempDir + "deploy_" + version + ".zip";
                    std::string tempExtractDir = tempDir + "deploy_" + version + "\\";

                    FileUtils::CreateFolder(updateCoreDir);
                    FileUtils::CreateFolder(tempDir);

                    // Download
                    result.status = AgentConstants::STATUS_DOWNLOADING;
                    result.resultData = "Downloading Bundle v" + version;
                    SendCommandResult(commandId, result);

                    if (!httpClient_->DownloadFileResumable(downloadUrl, tempZipPath)) {
                        result.errorMessage = "Failed to download bundle";
                    }
                    else if (!fileHash.empty()) {
                        std::string computed = ComputeFileSHA256(tempZipPath);
                        std::string hL = fileHash, cL = computed;
                        for (auto& c : hL) c = (char)tolower(c);
                        for (auto& c : cL) c = (char)tolower(c);
                        if (cL != hL) {
                            result.errorMessage = "Hash mismatch";
                            FileUtils::DeleteFile(tempZipPath);
                        }
                    }

                    if (result.errorMessage.empty()) {
                        result.status = AgentConstants::STATUS_INSTALLING;
                        result.resultData = "Installing Bundle v" + version;
                        SendCommandResult(commandId, result);

                        if (FileUtils::FolderExists(tempExtractDir)) FileUtils::DeleteFolder(tempExtractDir);
                        FileUtils::CreateFolder(tempExtractDir);

                        if (!ZipUtils::ExtractZip(tempZipPath, tempExtractDir)) {
                            result.errorMessage = "Failed to extract bundle";
                        } else {
                            if (FileUtils::CopyFolderContents(tempExtractDir, updateCoreDir)) {
                                FileUtils::DeleteFile(tempZipPath);
                                FileUtils::DeleteFolder(tempExtractDir);
                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "DeployBundle v" + version + " staged";
                                FactoryAgent::Utils::Logger::Info("[DeployBundle] v" + version + " staged");

                                if (pipeClient_) {
                                    std::string payload = "{\"type\":\"UpdateBundle\",\"version\":\"" + version + "\"}";
                                    pipeClient_->NotifyUpdate(payload);
                                }
                            } else {
                                result.errorMessage = "Failed to copy to staging";
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("DeployBundle error: ") + ex.what();
                FactoryAgent::Utils::Logger::Error("[DeployBundle] " + result.errorMessage);
            }
        }
    }
    // =============================================================================
    // DeployLAI — Copy LAI release from shared network path (no server download)
    // Agent pulls the binary directly from the shared UNC path.
    // =============================================================================
    else if (commandType == AgentConstants::COMMAND_DEPLOY_LAI) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                std::string sharedPath  = data.value("sharedPath", "");
                std::string packageName = data.value("packageName", "");
                std::string version     = data.value("version", "");

                if (sharedPath.empty() || packageName.empty()) {
                    result.errorMessage = "Missing sharedPath or packageName in DeployLAI";
                    FactoryAgent::Utils::Logger::Error("[DeployLAI] " + result.errorMessage);
                }
                else {
                    std::string installDir = std::string(AgentConstants::DEFAULT_INSTALL_DIR);
                    std::string updateLaiDir = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                    std::string backupLaiDir = installDir + AgentConstants::BACKUP_LAI_SUBDIR;
                    std::string srcPackage = sharedPath + "\\" + packageName;

                    FileUtils::CreateFolder(updateLaiDir);
                    FileUtils::CreateFolder(backupLaiDir);

                    // Check if source package exists on shared path
                    if (!FileUtils::FileExists(srcPackage)) {
                        result.errorMessage = "LAI package not found at: " + srcPackage;
                        FactoryAgent::Utils::Logger::Error("[DeployLAI] " + result.errorMessage);
                    }
                    else {
                        result.status = AgentConstants::STATUS_DOWNLOADING;
                        result.resultData = "Copying LAI v" + version + " from shared path";
                        SendCommandResult(commandId, result);

                        // Copy package from shared path to update/LAI/
                        std::string destZip = updateLaiDir + packageName;
                        if (!CopyFileA(srcPackage.c_str(), destZip.c_str(), FALSE)) {
                            result.errorMessage = "Failed to copy LAI package from shared path";
                            FactoryAgent::Utils::Logger::Error("[DeployLAI] CopyFile failed: " + srcPackage + " -> " + destZip);
                        }
                        else {
                            result.status = AgentConstants::STATUS_INSTALLING;
                            result.resultData = "Extracting LAI v" + version;
                            SendCommandResult(commandId, result);

                            // Extract the package into update/LAI/
                            if (!ZipUtils::ExtractZip(destZip, updateLaiDir)) {
                                result.errorMessage = "Failed to extract LAI package";
                            }
                            else {
                                // Clean up the zip
                                FileUtils::DeleteFile(destZip);

                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "LAI v" + version + " deployed from shared path";
                                FactoryAgent::Utils::Logger::Info("[DeployLAI] v" + version + " staged to " + updateLaiDir);

                                // Notify PipeServer about the LAI update
                                if (pipeClient_) {
                                    std::string payload = "{\"type\":\"UpdateLAI\",\"version\":\"" + version + "\"}";
                                    pipeClient_->NotifyUpdate(payload);
                                }
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("DeployLAI error: ") + ex.what();
                FactoryAgent::Utils::Logger::Error("[DeployLAI] " + result.errorMessage);
            }
        }
    }
    else {
        FactoryAgent::Utils::Logger::Warning(
            "[CommandExecutor] Unknown command type: " + commandType);
    }

    SendCommandResult(commandId, result);
    return result.success;
}

void CommandExecutor::SendCommandResult(int commandId, const CommandResult& result) {
    json request;
    request["commandId"] = commandId;
    request["status"] = result.status;
    request["resultData"] = result.resultData;
    request["errorMessage"] = result.errorMessage;

    json response;
    httpClient_->Post(AgentConstants::ENDPOINT_COMMAND_RESULT, request, response);
}
