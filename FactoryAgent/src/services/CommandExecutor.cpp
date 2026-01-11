#include "../include/services/CommandExecutor.h"
#include "../include/services/LogAnalyzerCommands.h"
#include "../include/services/ConfigService.h"
#include "../include/services/ModelService.h"
#include "../include/network/HttpClient.h"
#include "../include/common/Constants.h"
#include <fstream>
#include <iostream>

CommandExecutor::CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc) {
    httpClient_ = client;
    configService_ = configSvc;
    modelService_ = modelSvc;
}

CommandExecutor::~CommandExecutor() {
}

void CommandExecutor::ProcessCommands(const json& commands) {
    if (!commands.is_array()) {
        return;
    }

    int count = commands.size();
    for (int i = 0; i < count; i++) {
        ExecuteCommand(commands[i]);
    }
}

bool CommandExecutor::ExecuteCommand(const json& command) {
    if (!command.contains("commandId") || !command.contains("commandType")) {
        return false;
    }

    int commandId = command["commandId"].get<int>();
    std::string commandType = command["commandType"].get<std::string>();

    CommandResult result;
    result.commandId = commandId;
    result.success = false;
    result.status = AgentConstants::STATUS_FAILED;

    if (commandType == AgentConstants::COMMAND_UPDATE_CONFIG) {
        if (command.contains("commandData")) {
            std::string configContent = command["commandData"].get<std::string>();
            if (configService_->ApplyConfigFromServer(configContent)) {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_CHANGE_MODEL) {
        if (command.contains("commandData")) {
            json data = json::parse(command["commandData"].get<std::string>());
            if (data.contains("ModelName")) {
                std::string modelName = data["ModelName"].get<std::string>();
                if (modelService_->ChangeModel(modelName)) {
                    result.success = true;
                    result.status = AgentConstants::STATUS_COMPLETED;
                }
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPLOAD_MODEL) {
        if (command.contains("commandData")) {
            json data = json::parse(command["commandData"].get<std::string>());
            if (modelService_->UploadModelToServer(data)) {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_DELETE_MODEL) {
        if (command.contains("commandData")) {
            json data = json::parse(command["commandData"].get<std::string>());
            if (data.contains("ModelName")) {
                std::string modelName = data["ModelName"].get<std::string>();
                if (modelService_->DeleteModel(modelName)) {
                    result.success = true;
                    result.status = AgentConstants::STATUS_COMPLETED;
                }
            }
        }
    }
    else if (commandType == "UploadModelToLib") { // Using string literal as constant might not be defined yet
        if (command.contains("commandData")) {
            json data = json::parse(command["commandData"].get<std::string>());
            if (data.contains("ModelName") && data.contains("UploadUrl")) {
                std::string modelName = data["ModelName"].get<std::string>();
                std::string uploadUrl = data["UploadUrl"].get<std::string>();
                if (modelService_->UploadModelToLibrary(modelName, uploadUrl)) {
                    result.success = true;
                    result.status = AgentConstants::STATUS_COMPLETED;
                }
            }
        }
    }
    // NOTE: GetLogFileContent is now handled via WebSocket in AgentCore/LogService
    // It is no longer processed through the heartbeat polling mechanism

    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
        if (command.contains("commandData")) {
            try {
                json newData = json::parse(command["commandData"].get<std::string>());

                // 1. Read existing config to preserve other fields (like ServerUrl, PCId)
                std::ifstream inFile("agent_config.json");
                json currentConfig;
                if (inFile.is_open()) {
                    inFile >> currentConfig;
                    inFile.close();
                }
                else {
                    // Fallback or error if file missing
                    result.success = false;
                    result.errorMessage = "Could not find agent_config.json";
                    goto end_command; // Jump to result sending
                }

                // 2. Update fields
                if (newData.contains("LineNumber")) currentConfig["lineNumber"] = newData["LineNumber"];
                if (newData.contains("PCNumber")) currentConfig["pcNumber"] = newData["PCNumber"];
                if (newData.contains("ModelVersion")) currentConfig["modelVersion"] = newData["ModelVersion"];

                // 3. Write back to file
                std::ofstream outFile("agent_config.json");
                if (outFile.is_open()) {
                    outFile << currentConfig.dump(4); // Pretty print with 4 spaces
                    outFile.close();

                    result.success = true;
                    result.status = AgentConstants::STATUS_COMPLETED;
                    result.resultData = "Config updated. Agent requires restart to apply changes.";

                    // OPTIONAL: Force exit to trigger service restart so settings take effect
                    // exit(0); 
                }
                else {
                    result.success = false;
                    result.errorMessage = "Failed to write agent_config.json";
                }
            }
            catch (const std::exception& ex) {
                result.success = false;
                result.errorMessage = std::string("Error updating settings: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_RESET_AGENT) {
        try {
            // 1. Delete the config file
            if (std::remove("agent_config.json") == 0) {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
                result.resultData = "Agent config deleted. Shutting down.";

                // 2. IMPORTANT: Send the result IMMEDIATELY so Server knows to delete the record
                SendCommandResult(commandId, result);

                // 3. Wait a moment for network to flush, then exit
                Sleep(2000);
                exit(0);
            }
            else {
                // If file doesn't exist, we still consider it a success (it's already gone)
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
                result.resultData = "Config file not found (already deleted).";
            }
        }
        catch (const std::exception& ex) {
            result.success = false;
            result.errorMessage = ex.what();
        }
        }
    end_command:

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
