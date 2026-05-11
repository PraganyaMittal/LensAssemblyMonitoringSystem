#pragma once

// ============================================================================
// ModelCommandHandler — Handles ChangeModel, UploadModel, DeleteModel,
//                       UploadModelToLib commands
// ============================================================================

#include "commands/ICommandHandler.h"
#include "models/ModelService.h"
#include "models/ModelDeployer.h"
#include "models/SyncWorker.h"
#include "core/ConfigService.h"
#include "core/Logger.h"

class ModelCommandHandler : public ICommandHandler {
public:
	bool CanHandle(const std::string& commandType) const override {
		return commandType == AgentConstants::COMMAND_CHANGE_MODEL
			|| commandType == AgentConstants::COMMAND_UPLOAD_MODEL
			|| commandType == AgentConstants::COMMAND_DELETE_MODEL
			|| commandType == "UploadModelToLib";
	}

	CommandResult Execute(int commandId, const std::string& commandType,
	                      const json& data, CommandContext& ctx) override {
		CommandResult result;
		result.commandId = commandId;

		try {
			if (commandType == AgentConstants::COMMAND_CHANGE_MODEL) {
				HandleChangeModel(data, ctx, result);
			}
			else if (commandType == AgentConstants::COMMAND_UPLOAD_MODEL) {
				HandleUploadModel(data, ctx, result);
			}
			else if (commandType == AgentConstants::COMMAND_DELETE_MODEL) {
				HandleDeleteModel(data, ctx, result);
			}
			else if (commandType == "UploadModelToLib") {
				HandleUploadModelToLib(data, ctx, result);
			}
		} catch (const std::exception& ex) {
			result.errorMessage = std::string("Model command error: ") + ex.what();
		}

		return result;
	}

private:
	void HandleChangeModel(const json& data, CommandContext& ctx, CommandResult& result) {
		if (data.contains("ModelName")) {
			std::string modelName = data["ModelName"].get<std::string>();
			if (ctx.modelService && ctx.modelService->ChangeModel(modelName)) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
				if (ctx.syncWorker) ctx.syncWorker->SignalModelsDirty();
			}
		}
	}

	void HandleUploadModel(const json& data, CommandContext& ctx, CommandResult& result) {
		if (ctx.modelDeployer && data.contains("DownloadUrl") && data.contains("ModelName")) {
			DeployRequest req;
			req.downloadUrl = data["DownloadUrl"].get<std::string>();
			req.modelName = data["ModelName"].get<std::string>();
			if (data.contains("ExpectedChecksum"))
				req.expectedChecksum = data["ExpectedChecksum"].get<std::string>();
			if (data.contains("ApplyOnUpload"))
				req.applyOnUpload = data["ApplyOnUpload"].get<bool>();

			DeployResult deployResult = ctx.modelDeployer->DeployModel(req);

			if (deployResult.success) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
				result.resultData = "Checksum: " + deployResult.agentChecksum;

				if (req.applyOnUpload && ctx.configService)
					ctx.modelService->ChangeModel(req.modelName);

				if (ctx.syncWorker) ctx.syncWorker->SignalModelsDirty();
			} else {
				result.errorMessage = deployResult.errorMessage;
			}
		} else if (ctx.modelService) {
			if (ctx.modelService->UploadModelToServer(data)) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
				if (ctx.syncWorker) ctx.syncWorker->SignalModelsDirty();
			}
		}
	}

	void HandleDeleteModel(const json& data, CommandContext& ctx, CommandResult& result) {
		if (data.contains("ModelName")) {
			std::string modelName = data["ModelName"].get<std::string>();
			if (ctx.modelService && ctx.modelService->DeleteModel(modelName)) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
				if (ctx.syncWorker) ctx.syncWorker->SignalModelsDirty();
			}
		}
	}

	void HandleUploadModelToLib(const json& data, CommandContext& ctx, CommandResult& result) {
		if (data.contains("ModelName") && data.contains("UploadUrl")) {
			std::string modelName = data["ModelName"].get<std::string>();
			std::string uploadUrl = data["UploadUrl"].get<std::string>();
			if (ctx.modelService && ctx.modelService->UploadModelToLibrary(modelName, uploadUrl)) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
			}
		}
	}
};
