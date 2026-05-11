#pragma once

// ============================================================================
// ConfigCommandHandler — Handles UpdateConfig and UploadConfig commands
// ============================================================================

#include "commands/ICommandHandler.h"
#include "core/ConfigService.h"
#include "core/Logger.h"

class ConfigCommandHandler : public ICommandHandler {
public:
	bool CanHandle(const std::string& commandType) const override {
		return commandType == AgentConstants::COMMAND_UPDATE_CONFIG
			|| commandType == AgentConstants::COMMAND_UPLOAD_CONFIG;
	}

	CommandResult Execute(int commandId, const std::string& commandType,
	                      const json& data, CommandContext& ctx) override {
		CommandResult result;
		result.commandId = commandId;

		if (commandType == AgentConstants::COMMAND_UPDATE_CONFIG) {
			// data is the raw config string (not parsed JSON)
			std::string configContent = data.is_string() ? data.get<std::string>() : data.dump();
			if (ctx.configService && ctx.configService->ApplyConfigFromServer(configContent)) {
				result.success = true;
				result.status = AgentConstants::STATUS_COMPLETED;
			} else {
				result.errorMessage = "Failed to apply config from server.";
			}
		}
		else if (commandType == AgentConstants::COMMAND_UPLOAD_CONFIG) {
			try {
				if (data.contains("RequestId")) {
					std::string requestId = data["RequestId"].get<std::string>();
					if (ctx.configService && ctx.configService->UploadConfigToServer(requestId)) {
						result.success = true;
						result.status = AgentConstants::STATUS_COMPLETED;
					}
				}
			} catch (const std::exception& ex) {
				result.errorMessage = std::string("Config upload error: ") + ex.what();
			}
		}

		return result;
	}
};
