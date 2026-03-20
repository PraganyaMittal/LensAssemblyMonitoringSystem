#include "services/CommandExecutor.h"
#include "services/ConfigService.h"
#include "services/ModelService.h"
#include "services/PipeClient.h"
#include "services/SyncWorker.h"
#include "services/ModelDeployer.h"
#include "services/LogService.h"
#include "network/HttpClient.h"
#include "common/Constants.h"
#include "utilities/ZipUtils.h"
#include "utilities/FileUtils.h"
#include "Utils/Logger.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

// ── Helpers ────────────────────────────────────────────────────────────────
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

static std::string GetExeDirectory() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string dir(path);
    size_t pos = dir.find_last_of("\\/");
    return (pos != std::string::npos) ? dir.substr(0, pos + 1) : dir;
}

// Write a staging marker file so the IPC layer can re-send NOTIFY_UPDATE
// on reconnect if the pipe was down when staging completed.
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

    Logger::Info(
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

                        if (req.applyOnUpload && configService_) {
                            modelService_->ChangeModel(req.modelName);
                        }

                        if (syncWorker_) {
                            syncWorker_->SignalModelsDirty();
                        }
                    } else {
                        result.errorMessage = deployResult.errorMessage;
                    }
                } else {
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
    // ────────────────────────────────────────────────────────────────────────
    // UpdateBundle — download full bundle (Core + LAI) from server URL
    // ────────────────────────────────────────────────────────────────────────
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
                    Logger::Error("[UpdateBundle] Missing downloadUrl in commandData");
                }
                else {
                    // Create staging directories
                    std::string updateBundleDir = installDir + AgentConstants::UPDATE_BUNDLE_SUBDIR;
                    std::string updateLaiDir  = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                    std::string backupBundleDir = installDir + AgentConstants::BACKUP_BUNDLE_SUBDIR;
                    std::string backupLaiDir  = installDir + AgentConstants::BACKUP_LAI_SUBDIR;
                    std::string tempDir       = installDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
                    std::string tempZipPath   = tempDir + "bundle_" + version + ".zip";
                    std::string tempExtractDir = tempDir + "bundle_" + version + "\\";

                    Logger::Info("[UpdateBundle] Staging dirs: Bundle=" + updateBundleDir + " LAI=" + updateLaiDir);

                    if (!FileUtils::CreateFolder(updateBundleDir) ||
                        !FileUtils::CreateFolder(updateLaiDir) ||
                        !FileUtils::CreateFolder(backupBundleDir) ||
                        !FileUtils::CreateFolder(backupLaiDir) ||
                        !FileUtils::CreateFolder(tempDir)) {
                        result.errorMessage = "Failed to create staging directories under: " + installDir;
                        Logger::Error("[UpdateBundle] " + result.errorMessage);
                    }

                    if (result.errorMessage.empty()) {
                        // Download
                        result.status = AgentConstants::STATUS_DOWNLOADING;
                        result.resultData = "Downloading Bundle v" + version;
                        SendCommandResult(commandId, result);
                        Logger::Info("[UpdateBundle] Downloading from: " + downloadUrl);

                        if (!httpClient_->DownloadFileResumable(downloadUrl, tempZipPath)) {
                            result.errorMessage = "Failed to download bundle package";
                            Logger::Error("[UpdateBundle] Download failed for: " + downloadUrl);
                        }
                        else if (!FileUtils::FileExists(tempZipPath)) {
                            result.errorMessage = "Downloaded file not found on disk";
                            Logger::Error("[UpdateBundle] File not found after download: " + tempZipPath);
                        }
                        else if (!fileHash.empty()) {
                            // Verify hash
                            std::string computed = ComputeFileSHA256(tempZipPath);
                            std::string hL = fileHash, cL = computed;
                            for (auto& c : hL) c = (char)tolower(c);
                            for (auto& c : cL) c = (char)tolower(c);
                            if (cL != hL) {
                                result.errorMessage = "Hash mismatch! Expected: " + fileHash + " Got: " + computed;
                                Logger::Error("[UpdateBundle] " + result.errorMessage);
                                FileUtils::DeleteFile(tempZipPath);
                            } else {
                                Logger::Info("[UpdateBundle] SHA-256 hash verified OK");
                            }
                        }
                    }

                    if (result.errorMessage.empty()) {
                        result.status = AgentConstants::STATUS_INSTALLING;
                        result.resultData = "Installing Bundle v" + version;
                        SendCommandResult(commandId, result);

                        if (FileUtils::FolderExists(tempExtractDir)) {
                            FileUtils::DeleteFolder(tempExtractDir);
                        }
                        FileUtils::CreateFolder(tempExtractDir);

                        if (!ZipUtils::ExtractZip(tempZipPath, tempExtractDir)) {
                            result.errorMessage = "Failed to extract bundle zip";
                            Logger::Error("[UpdateBundle] Extraction failed to: " + tempExtractDir);
                        }
                        else {
                            // Detect wrapper directory
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
                                        Logger::Info("[UpdateBundle] Detected wrapper directory: " + singleDir + ", using as effective root");
                                    }
                                }
                            }

                            // Copy core components to staging
                            bool copyOk = true;
                            std::vector<std::string> bundleComponents = {"FactoryAgent", "FactoryService", "AutoUpdater"};

                            for (const auto& component : bundleComponents) {
                                std::string srcDir = effectiveRoot + component + "\\";
                                if (FileUtils::FolderExists(srcDir)) {
                                    Logger::Info("[UpdateBundle] Copying " + component + " to update/Bundle/");
                                    if (!FileUtils::CopyFolderContents(srcDir, updateBundleDir)) {
                                        result.errorMessage = "Failed to copy " + component + " to staging";
                                        Logger::Error("[UpdateBundle] " + result.errorMessage);
                                        copyOk = false;
                                        break;
                                    }
                                }
                            }

                            if (copyOk) {
                                std::string laiSrc = effectiveRoot + "LAI\\";
                                if (FileUtils::FolderExists(laiSrc)) {
                                    Logger::Info("[UpdateBundle] Copying LAI to update/LAI/");
                                    if (!FileUtils::CopyFolderContents(laiSrc, updateLaiDir)) {
                                        result.errorMessage = "Failed to copy LAI to staging";
                                        Logger::Error("[UpdateBundle] " + result.errorMessage);
                                        copyOk = false;
                                    }
                                }
                            }

                            if (copyOk) {
                                FileUtils::DeleteFile(tempZipPath);
                                FileUtils::DeleteFolder(tempExtractDir);

                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "Bundle v" + version + " staged successfully";
                                Logger::Info("[UpdateBundle] v" + version + " deployed to staging directories");

                                // Notify FactoryService about staged update + write marker
                                std::string updatePayload = "{\"type\":\"UpdateBundle\",\"version\":\"" + version + "\",\"installDir\":\"" + installDir + "\"}";
                                WriteStagingMarker(installDir, updatePayload);
                                if (pipeClient_) {
                                    pipeClient_->NotifyUpdate(updatePayload);
                                }
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("UpdateBundle error: ") + ex.what();
                Logger::Error("[UpdateBundle] Exception: " + result.errorMessage);
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
        if (command.contains("commandData")) {
            try {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
                result.resultData = "Agent settings updated. Restarting agent to apply changes...";
                
                SendCommandResult(commandId, result);
                
                Sleep(1000);
                
                char exePath[MAX_PATH];
                GetModuleFileNameA(NULL, exePath, MAX_PATH);
                ShellExecuteA(NULL, "open", exePath, NULL, NULL, SW_SHOWDEFAULT);

                HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
                if (hwnd) {
                    PostMessage(hwnd, WM_CLOSE, 0, 0);
                }
            }
            catch (const std::exception& ex) {
                result.success = false;
                result.errorMessage = std::string("Error accepting settings update: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_RESET_AGENT) {
        try {
            bool deleted = (std::remove("agent_config.json") == 0);

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

            SendCommandResult(commandId, result);

            Sleep(1000);
            HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
            if (hwnd) {
                PostMessage(hwnd, WM_CLOSE, 0, 0);
            }
        }
        catch (const std::exception&) {
            result.success = false;
            SendCommandResult(commandId, result);
            Sleep(1000);
            HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
            if (hwnd) {
                PostMessage(hwnd, WM_CLOSE, 0, 0);
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────
    // DeployBundle — orchestrated deployment from LineDeploymentOrchestratorService
    // ────────────────────────────────────────────────────────────────────────
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
                    Logger::Error("[DeployBundle] " + result.errorMessage);
                }
                else {
                    std::string updateBundleDir = installDir + AgentConstants::UPDATE_BUNDLE_SUBDIR;
                    std::string tempDir       = installDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
                    std::string tempZipPath   = tempDir + "deploy_" + version + ".zip";
                    std::string tempExtractDir = tempDir + "deploy_" + version + "\\";

                    FileUtils::CreateFolder(updateBundleDir);
                    FileUtils::CreateFolder(tempDir);

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
                            if (FileUtils::CopyFolderContents(tempExtractDir, updateBundleDir)) {
                                FileUtils::DeleteFile(tempZipPath);
                                FileUtils::DeleteFolder(tempExtractDir);
                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "DeployBundle v" + version + " staged";
                                Logger::Info("[DeployBundle] v" + version + " staged");

                                // Notify + write marker
                                {
                                    json payloadObj;
                                    payloadObj["type"] = "UpdateBundle";
                                    payloadObj["version"] = version;
                                    payloadObj["installDir"] = installDir;
                                    std::string notifyPayload = payloadObj.dump();
                                    WriteStagingMarker(installDir, notifyPayload);
                                    if (pipeClient_) {
                                        pipeClient_->NotifyUpdate(notifyPayload);
                                    }
                                }
                            } else {
                                result.errorMessage = "Failed to copy to staging";
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("DeployBundle error: ") + ex.what();
                Logger::Error("[DeployBundle] " + result.errorMessage);
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────
    // RollbackBundle — orchestrated rollback from LineDeploymentOrchestratorService
    // ────────────────────────────────────────────────────────────────────────
    else if (commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                std::string installDir = data.value("installDir", std::string(AgentConstants::DEFAULT_INSTALL_DIR));
                std::string version = data.value("version", "Backup");

                std::string updateBundleDir = installDir + AgentConstants::UPDATE_BUNDLE_SUBDIR;
                std::string backupBundleDir = installDir + AgentConstants::BACKUP_BUNDLE_SUBDIR;
                std::string updateLaiDir  = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                // Don't rollback LAI when rolling back Bundle according to the new decoupled structure
                // They are managed completely separately now.

                if (!FileUtils::FolderExists(backupBundleDir)) {
                    result.errorMessage = "Bundle Backup directory not found. Cannot rollback.";
                    Logger::Error("[RollbackBundle] " + result.errorMessage);
                } else {
                    FileUtils::CreateFolder(updateBundleDir);

                    result.status = AgentConstants::STATUS_INSTALLING;
                    result.resultData = "Restoring bundle from backup";
                    SendCommandResult(commandId, result);

                    bool bundleOk = FileUtils::CopyFolderContents(backupBundleDir, updateBundleDir);

                    if (bundleOk) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        result.resultData = "Rollback staged successfully";
                        Logger::Info("[RollbackBundle] Backup restored to staging directory");

                        // Notify pipe server with rollback type so AutoUpdater skips backup
                        json payloadObj;
                        payloadObj["type"] = "RollbackBundle";
                        payloadObj["version"] = version;
                        payloadObj["installDir"] = installDir;
                        std::string notifyPayload = payloadObj.dump();
                        WriteStagingMarker(installDir, notifyPayload);
                        if (pipeClient_) {
                            pipeClient_->NotifyUpdate(notifyPayload);
                        }
                    } else {
                        result.errorMessage = "Failed to restore backup files to update directory.";
                        Logger::Error("[RollbackBundle] " + result.errorMessage);
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("RollbackBundle error: ") + ex.what();
                Logger::Error("[RollbackBundle] " + result.errorMessage);
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────
    // RollbackLAI — user-triggered LAI rollback from web UI
    // ────────────────────────────────────────────────────────────────────────
    else if (commandType == AgentConstants::COMMAND_ROLLBACK_LAI) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                std::string installDir = data.value("installDir", std::string(AgentConstants::DEFAULT_INSTALL_DIR));
                std::string version = data.value("version", "Backup");

                std::string updateLaiDir  = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                std::string backupLaiDir  = installDir + AgentConstants::BACKUP_LAI_SUBDIR;

                if (!FileUtils::FolderExists(backupLaiDir)) {
                    result.errorMessage = "LAI backup directory not found. Cannot rollback.";
                    Logger::Error("[RollbackLAI] " + result.errorMessage);
                } else {
                    FileUtils::CreateFolder(updateLaiDir);

                    result.status = AgentConstants::STATUS_INSTALLING;
                    result.resultData = "Restoring LAI from backup";
                    SendCommandResult(commandId, result);

                    if (FileUtils::CopyFolderContents(backupLaiDir, updateLaiDir)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        result.resultData = "LAI rollback staged successfully";
                        Logger::Info("[RollbackLAI] Backup restored to staging directory");

                        // Notify pipe server with rollback type so AutoUpdater skips backup
                        json payloadObj;
                        payloadObj["type"] = "RollbackLAI";
                        payloadObj["version"] = version;
                        payloadObj["installDir"] = installDir;
                        std::string notifyPayload = payloadObj.dump();
                        WriteStagingMarker(installDir, notifyPayload);
                        if (pipeClient_) {
                            pipeClient_->NotifyUpdate(notifyPayload);
                        }
                    } else {
                        result.errorMessage = "Failed to restore LAI backup files to staging.";
                        Logger::Error("[RollbackLAI] " + result.errorMessage);
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("RollbackLAI error: ") + ex.what();
                Logger::Error("[RollbackLAI] " + result.errorMessage);
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────
    // DeployLAI — LAI-only deployment from shared network path
    // ────────────────────────────────────────────────────────────────────────
    else if (commandType == AgentConstants::COMMAND_DEPLOY_LAI) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                std::string sharedPath  = data.value("sharedPath", "");
                std::string packageName = data.value("packageName", "");
                std::string version     = data.value("version", "");

                if (sharedPath.empty() || packageName.empty()) {
                    result.errorMessage = "Missing sharedPath or packageName in DeployLAI";
                    Logger::Error("[DeployLAI] " + result.errorMessage);
                }
                else {
                    std::string installDir = data.value("installDir", std::string(AgentConstants::DEFAULT_INSTALL_DIR));
                    std::string updateLaiDir = installDir + AgentConstants::UPDATE_LAI_SUBDIR;
                    std::string backupLaiDir = installDir + AgentConstants::BACKUP_LAI_SUBDIR;
                    std::string srcPackage = sharedPath + "\\" + packageName;

                    FileUtils::CreateFolder(updateLaiDir);
                    FileUtils::CreateFolder(backupLaiDir);

                    if (!FileUtils::FileExists(srcPackage)) {
                        result.errorMessage = "LAI package not found at: " + srcPackage;
                        Logger::Error("[DeployLAI] " + result.errorMessage);
                    }
                    else {
                        result.status = AgentConstants::STATUS_DOWNLOADING;
                        result.resultData = "Copying LAI v" + version + " from shared path";
                        SendCommandResult(commandId, result);

                        std::string destZip = updateLaiDir + packageName;
                        if (!CopyFileA(srcPackage.c_str(), destZip.c_str(), FALSE)) {
                            result.errorMessage = "Failed to copy LAI package from shared path";
                            Logger::Error("[DeployLAI] CopyFile failed: " + srcPackage + " -> " + destZip);
                        }
                        else {
                            result.status = AgentConstants::STATUS_INSTALLING;
                            result.resultData = "Extracting LAI v" + version;
                            SendCommandResult(commandId, result);

                            if (!ZipUtils::ExtractZip(destZip, updateLaiDir)) {
                                result.errorMessage = "Failed to extract LAI package";
                            }
                            else {
                                FileUtils::DeleteFile(destZip);

                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "LAI v" + version + " deployed from shared path";
                                Logger::Info("[DeployLAI] v" + version + " staged to " + updateLaiDir);

                                // Notify PipeServer about the LAI update + write marker
                                {
                                    json payloadObj;
                                    payloadObj["type"] = "UpdateLAI";
                                    payloadObj["version"] = version;
                                    payloadObj["installDir"] = installDir;
                                    std::string notifyPayload = payloadObj.dump();
                                    WriteStagingMarker(installDir, notifyPayload);
                                    if (pipeClient_) {
                                        pipeClient_->NotifyUpdate(notifyPayload);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("DeployLAI error: ") + ex.what();
                Logger::Error("[DeployLAI] " + result.errorMessage);
            }
        }
    }
    else {
        Logger::Warning(
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
