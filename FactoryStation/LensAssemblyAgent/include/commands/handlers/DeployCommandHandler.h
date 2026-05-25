#pragma once








#include "commands/ICommandHandler.h"
#include "network/PipeClient.h"
#include "network/RestClient.h"
#include "PathResolver.h"
#include "core/Logger.h"
#include <fstream>
#include <filesystem>

class DeployCommandHandler : public ICommandHandler {
public:
	bool CanHandle(const std::string& commandType) const override {
		return commandType == AgentConstants::COMMAND_UPDATE_BUNDLE
			|| commandType == AgentConstants::COMMAND_DEPLOY_BUNDLE
			|| commandType == AgentConstants::COMMAND_DEPLOY_LAI
			|| commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE
			|| commandType == AgentConstants::COMMAND_ROLLBACK_LAI;
	}

	CommandResult Execute(int commandId, const std::string& commandType,
	                      const json& data, CommandContext& ctx) override {
		CommandResult result;
		result.commandId = commandId;

		bool isBundle = (commandType == AgentConstants::COMMAND_UPDATE_BUNDLE ||
		                 commandType == AgentConstants::COMMAND_DEPLOY_BUNDLE ||
		                 commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE);

		Logger::Info("[Deploy] Handling " + commandType + " (ID: " + std::to_string(commandId) + ")");

		
		if (!PipeClient::IsServiceRunning(AgentConstants::SERVICE_NAME)) {
			result.errorMessage = "Update service is not running. Cannot process deploy request.";
			Logger::Error("[Deploy] " + result.errorMessage);
			SendResult(commandId, result, ctx);
			return {};  
		}

		
		bool isRollback = (commandType == AgentConstants::COMMAND_ROLLBACK_BUNDLE ||
		                   commandType == AgentConstants::COMMAND_ROLLBACK_LAI);

		if (isRollback && !ValidateRollbackBackup(isBundle, commandId, result, ctx)) {
			return {};  
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
			std::string baseDir = PathResolver::ResolveBaseDirA();
			std::ofstream cmdFile(baseDir + ".update_command_id");
			if (cmdFile.is_open()) {
				cmdFile << std::to_string(commandId);
				cmdFile.close();
			}
		} catch (...) {}

		
		PipeClient pipe;
		if (!pipe.SendDeployRequest(deployPayload.dump())) {
			result.errorMessage = "Failed to send deploy request to update service via IPC.";
			Logger::Error("[Deploy] " + result.errorMessage);
			SendResult(commandId, result, ctx);
			return {};  
		}

		if (isBundle) {
			Logger::Info("[Deploy] Bundle update — agent stays alive. AutoUpdater will signal shutdown when ready.");
		} else {
			Logger::Info("[Deploy] LAI update — agent remaining active.");
		}

		return {};  
	}

private:
	void SendResult(int commandId, const CommandResult& result, CommandContext& ctx) {
		json request;
		request["commandId"] = commandId;
		request["status"] = result.status;
		request["resultData"] = result.resultData;
		request["errorMessage"] = result.errorMessage;

		json response;
		if (ctx.httpClient) {
			ctx.httpClient->Post(AgentConstants::ENDPOINT_COMMAND_RESULT, request, response);
		}
	}

	bool ValidateRollbackBackup(bool isBundle, int commandId, CommandResult& result, CommandContext& ctx) {
		std::string baseDir = PathResolver::ResolveBaseDirA();
		std::string backupSubdir = isBundle ? "backup\\Bundle\\" : "backup\\LAI\\";
		std::string backupDir = baseDir + backupSubdir;
		std::string manifestPath = backupDir + "backup_manifest.json";

		if (!std::filesystem::exists(backupDir)) {
			result.errorMessage = "Rollback failed: No backup directory found at " + backupDir;
			Logger::Error("[Deploy] " + result.errorMessage);
			SendResult(commandId, result, ctx);
			return false;
		}

		if (std::filesystem::is_empty(backupDir)) {
			result.errorMessage = "Rollback failed: Backup directory is empty at " + backupDir;
			Logger::Error("[Deploy] " + result.errorMessage);
			SendResult(commandId, result, ctx);
			return false;
		}

		if (!std::filesystem::exists(manifestPath)) {
			Logger::Warning("[Deploy] backup_manifest.json not found at " + manifestPath
				+ ". Proceeding with unverified backup.");
		} else {
			try {
				std::ifstream manifestFile(manifestPath);
				if (manifestFile.is_open()) {
					json manifest = json::parse(manifestFile);
					int fileCount = manifest.value("fileCount", 0);
					std::string backupType = manifest.value("type", "");

					if (fileCount == 0) {
						result.errorMessage = "Rollback failed: Backup manifest reports 0 files";
						Logger::Error("[Deploy] " + result.errorMessage);
						SendResult(commandId, result, ctx);
						return false;
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
		return true;
	}
};
