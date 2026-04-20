#include "commands/CommandExecutor.h"
#include "core/ConfigService.h"
#include "models/ModelService.h"
#include "network/PipeClient.h"
#include "models/SyncWorker.h"
#include "models/ModelDeployer.h"
#include "logs/LogService.h"
#include "network/HttpClient.h"
#include "common/Constants.h"
#include "utilities/ZipUtils.h"
#include "utilities/FileUtils.h"
#include "utilities/CryptoUtils.h"
#include "core/Logger.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <windows.h>
#include <shellapi.h>
#include <vector>

// NOTE: StagingPipeline.h include removed — staging moved to service

static std::string GetExeDirectory() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string dir(path);
    size_t pos = dir.find_last_of("\\/");
    return (pos != std::string::npos) ? dir.substr(0, pos + 1) : dir;
}

// NOTE: PipeClient removed from constructor — one-shot instances created on demand
CommandExecutor::CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc)
    : httpClient_(client), configService_(configSvc), modelService_(modelSvc),
      syncWorker_(nullptr), modelDeployer_(nullptr) {
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

    // All deploy commands are handled by HandleDeployCommand.
    // Agent relays to the service via IPC. For Bundle updates, agent self-exits.
    // For LAI updates, agent stays running.
    else if (commandType == AgentConstants::COMMAND_UPDATE_BUNDLE ||
             commandType == AgentConstants::COMMAND_DEPLOY_BUNDLE ||
             commandType == AgentConstants::COMMAND_DEPLOY_LAI ||
             commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE ||
             commandType == AgentConstants::COMMAND_ROLLBACK_LAI) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                HandleDeployCommand(commandId, commandType, data);
                return true;
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("Deploy command error: ") + ex.what();
                Logger::Error("[Deploy] " + result.errorMessage);
            }
        }
    }

    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
        try {
            result.success = true;
            result.status = AgentConstants::STATUS_COMPLETED;
            result.resultData = "Agent settings updated. Exiting — Watchdog will restart with new settings.";

            SendCommandResult(commandId, result);

            Sleep(500);
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

    else if (commandType == AgentConstants::COMMAND_DECOMMISSION) {
        Logger::Info("[CommandExecutor] Decommission received. Launching ServiceSetup uninstall...");
        try {
            char exePath[MAX_PATH];
            if (GetModuleFileNameA(NULL, exePath, MAX_PATH)) {
                std::string p(exePath);
                auto pos = p.find_last_of("\\");
                std::string bundleDir = (pos != std::string::npos) ? p.substr(0, pos + 1) : ".\\";
                std::string setupPath = bundleDir + "ServiceSetup.exe";

                ShellExecuteA(NULL, "runas", setupPath.c_str(),
                              "--uninstall", bundleDir.c_str(), SW_HIDE);
            }
            result.success = true;
            result.status = AgentConstants::STATUS_COMPLETED;
            result.resultData = "Decommission initiated. ServiceSetup uninstall running.";
        } catch (const std::exception& ex) {
            result.success = false;
            result.errorMessage = std::string("Decommission error: ") + ex.what();
        }
    }

    else {
        Logger::Warning(
            "[CommandExecutor] Unknown command type: " + commandType);
    }

    SendCommandResult(commandId, result);
    return result.success;
}


void CommandExecutor::HandleDeployCommand(int commandId, const std::string& commandType, const json& data) {
    CommandResult result;
    result.commandId = commandId;
    result.success = false;
    result.status = AgentConstants::STATUS_FAILED;

    bool isBundle = (commandType == AgentConstants::COMMAND_UPDATE_BUNDLE ||
                     commandType == AgentConstants::COMMAND_DEPLOY_BUNDLE ||
                     commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE);

    Logger::Info("[Deploy] Handling " + commandType + " (ID: " + std::to_string(commandId) + ")");

    if (!PipeClient::IsServiceRunning(AgentConstants::SERVICE_NAME)) {
        result.errorMessage = "Update service is not running. Cannot process deploy request.";
        Logger::Error("[Deploy] " + result.errorMessage);
        SendCommandResult(commandId, result);
        return;
    }

    // ── Rollback Pre-Validation ──
    // Before dispatching a rollback, verify the backup exists and is valid.
    // This prevents sending a rollback command that would fail at the Service/AutoUpdater level.
    bool isRollback = (commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE ||
                       commandType == AgentConstants::COMMAND_ROLLBACK_LAI);

    if (isRollback) {
        std::string baseDir = AgentConstants::DEFAULT_INSTALL_DIR;
        try {
            char exePath[MAX_PATH];
            if (GetModuleFileNameA(NULL, exePath, MAX_PATH)) {
                std::string p(exePath);
                auto pos1 = p.find_last_of("\\");
                if (pos1 != std::string::npos) {
                    auto pos2 = p.find_last_of("\\", pos1 - 1);
                    if (pos2 != std::string::npos) {
                        baseDir = p.substr(0, pos2 + 1);
                    }
                }
            }
        } catch (...) {}

        std::string backupSubdir = isBundle ? "backup\\Bundle\\" : "backup\\LAI\\";
        std::string backupDir = baseDir + backupSubdir;
        std::string manifestPath = backupDir + "backup_manifest.json";

        // Check 1: Backup directory exists
        if (!std::filesystem::exists(backupDir)) {
            result.errorMessage = "Rollback failed: No backup directory found at " + backupDir;
            Logger::Error("[Deploy] " + result.errorMessage);
            SendCommandResult(commandId, result);
            return;
        }

        // Check 2: Backup directory is not empty
        if (std::filesystem::is_empty(backupDir)) {
            result.errorMessage = "Rollback failed: Backup directory is empty at " + backupDir;
            Logger::Error("[Deploy] " + result.errorMessage);
            SendCommandResult(commandId, result);
            return;
        }

        // Check 3: Backup manifest exists
        if (!std::filesystem::exists(manifestPath)) {
            Logger::Warning("[Deploy] backup_manifest.json not found at " + manifestPath
                + ". Proceeding with unverified backup.");
        } else {
            // Check 4: Parse manifest and verify file count
            try {
                std::ifstream manifestFile(manifestPath);
                if (manifestFile.is_open()) {
                    json manifest = json::parse(manifestFile);
                    int fileCount = manifest.value("fileCount", 0);
                    std::string backupType = manifest.value("type", "");

                    if (fileCount == 0) {
                        result.errorMessage = "Rollback failed: Backup manifest reports 0 files";
                        Logger::Error("[Deploy] " + result.errorMessage);
                        SendCommandResult(commandId, result);
                        return;
                    }

                    Logger::Info("[Deploy] Backup manifest valid: type=" + backupType
                        + ", fileCount=" + std::to_string(fileCount));
                }
            } catch (const std::exception& ex) {
                Logger::Warning("[Deploy] Failed to parse backup manifest: " + std::string(ex.what())
                    + ". Proceeding with unverified backup.");
            }
        }

        Logger::Info("[Deploy] Rollback pre-validation passed.");
    }

    json deployPayload;
    deployPayload["type"]        = commandType;
    deployPayload["commandId"]   = commandId;
    deployPayload["sharedPath"]  = data.value("sharedPath", "");
    deployPayload["packageName"] = data.value("packageName", "");
    deployPayload["version"]     = data.value("version", "");
    deployPayload["fileHash"]    = data.value("fileHash", "");
    deployPayload["shareUser"]   = data.value("shareUser", "");
    deployPayload["sharePass"]   = data.value("sharePass", "");

    if (isRollback) {
        deployPayload["isRollback"] = true;
    }

    Logger::Info("[Deploy] Deploy payload: type=" + commandType 
        + ", version=" + deployPayload["version"].get<std::string>());

    try {
        std::string baseDir = AgentConstants::DEFAULT_INSTALL_DIR;
        char exePath[MAX_PATH];
        if (GetModuleFileNameA(NULL, exePath, MAX_PATH)) {
            std::string p(exePath);
            auto pos1 = p.find_last_of("\\");
            if (pos1 != std::string::npos) {
                auto pos2 = p.find_last_of("\\", pos1 - 1);
                if (pos2 != std::string::npos) {
                    baseDir = p.substr(0, pos2 + 1);
                }
            }
        }
        std::ofstream cmdFile(baseDir + ".update_command_id");
        if (cmdFile.is_open()) {
            cmdFile << std::to_string(commandId);
            cmdFile.close();
        }
    } catch (...) {}

    PipeClient pipe;
    if (!pipe.SendDeployRequest(deployPayload.dump())) {
        result.success = false;
        result.status = AgentConstants::STATUS_FAILED;
        result.errorMessage = "Failed to send deploy request to update service via IPC.";
        Logger::Error("[Deploy] " + result.errorMessage);
        SendCommandResult(commandId, result);
        return;
    }


    if (isBundle) {
        Logger::Info("[Deploy] Bundle update — agent stays alive. AutoUpdater will signal shutdown when ready.");
    } else {
        Logger::Info("[Deploy] LAI update — agent remaining active.");
    }
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
