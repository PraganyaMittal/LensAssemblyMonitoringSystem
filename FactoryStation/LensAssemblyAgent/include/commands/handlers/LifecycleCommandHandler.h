#pragma once









#include "commands/ICommandHandler.h"
#include "network/RestClient.h"
#include "PathResolver.h"
#include "core/Logger.h"
#include <fstream>
#include <windows.h>
#include <shellapi.h>

class LifecycleCommandHandler : public ICommandHandler {
public:
	bool CanHandle(const std::string& commandType) const override {
		return commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS
			|| commandType == AgentConstants::COMMAND_RESET_AGENT
			|| commandType == AgentConstants::COMMAND_DECOMMISSION;
	}

	CommandResult Execute(int commandId, const std::string& commandType,
	                      const json& data, CommandContext& ctx) override {
		CommandResult result;
		result.commandId = commandId;

		if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
			HandleUpdateSettings(commandId, result, ctx);
		}
		else if (commandType == AgentConstants::COMMAND_RESET_AGENT) {
			HandleResetAgent(commandId, result, ctx);
		}
		else if (commandType == AgentConstants::COMMAND_DECOMMISSION) {
			HandleDecommission(commandId, result, ctx);
		}

		return result;
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

	void ShutdownAgent(int delayMs = 1000) {
		Sleep(delayMs);
		HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
		if (hwnd) {
			PostMessage(hwnd, WM_CLOSE, 0, 0);
		}
	}

	void HandleUpdateSettings(int commandId, CommandResult& result, CommandContext& ctx) {
		try {
			result.success = true;
			result.status = AgentConstants::STATUS_COMPLETED;
			result.resultData = "Agent settings updated. Exiting — Watchdog will restart with new settings.";

			SendResult(commandId, result, ctx);
			ShutdownAgent(500);

			
			result = {};
		}
		catch (const std::exception& ex) {
			result.errorMessage = std::string("Error accepting settings update: ") + ex.what();
		}
	}

	void HandleResetAgent(int commandId, CommandResult& result, CommandContext& ctx) {
		try {
			bool deleted = (std::remove(AgentConstants::CONFIG_FILE_NAME) == 0);

			if (!deleted) {
				std::ofstream wiper(AgentConstants::CONFIG_FILE_NAME, std::ofstream::trunc);
				if (wiper.is_open()) {
					wiper << "{}";
					wiper.close();
				}
			}

			result.success = true;
			result.status = AgentConstants::STATUS_COMPLETED;
			result.resultData = "Agent reset command received. Shutting down.";

			SendResult(commandId, result, ctx);
			ShutdownAgent();

			
			result = {};
		}
		catch (const std::exception&) {
			result.success = false;
			SendResult(commandId, result, ctx);
			ShutdownAgent();
			result = {};
		}
	}

	void HandleDecommission(int commandId, CommandResult& result, CommandContext& ctx) {
		Logger::Info("[CommandDispatcher] Decommission received. Launching ServiceSetup uninstall...");
		try {
			std::string baseDir = PathResolver::ResolveBaseDirA();
			std::string bundleDir = PathResolver::BundleDirA(baseDir);
			std::string setupPath = bundleDir + "ServiceSetup.exe";

			ShellExecuteA(NULL, "runas", setupPath.c_str(),
			              "--uninstall", bundleDir.c_str(), SW_HIDE);

			result.success = true;
			result.status = AgentConstants::STATUS_COMPLETED;
			result.resultData = "Decommission initiated. ServiceSetup uninstall running.";
		} catch (const std::exception& ex) {
			result.success = false;
			result.errorMessage = std::string("Decommission error: ") + ex.what();
		}
	}
};
