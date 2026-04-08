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

    json deployPayload;
    deployPayload["type"]        = commandType;
    deployPayload["commandId"]   = commandId;
    deployPayload["sharedPath"]  = data.value("sharedPath", "");
    deployPayload["packageName"] = data.value("packageName", "");
    deployPayload["version"]     = data.value("version", "");
    deployPayload["fileHash"]    = data.value("fileHash", "");
    deployPayload["shareUser"]   = data.value("shareUser", "");
    deployPayload["sharePass"]   = data.value("sharePass", "");

    if (commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE ||
        commandType == AgentConstants::COMMAND_ROLLBACK_LAI) {
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
        Logger::Info("[Deploy] Bundle update — agent shutting down.");
        HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
        if (hwnd) {
            PostMessage(hwnd, WM_CLOSE, 0, 0);
        }
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
