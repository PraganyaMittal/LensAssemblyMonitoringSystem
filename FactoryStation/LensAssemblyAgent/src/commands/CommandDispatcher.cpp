#include "commands/CommandDispatcher.h"
#include "network/RestClient.h"
#include "common/Constants.h"

CommandDispatcher::CommandDispatcher(RestClient* httpClient, ConfigService* configSvc,
                                     ModelService* modelSvc) {
	ctx_.httpClient = httpClient;
	ctx_.configService = configSvc;
	ctx_.modelService = modelSvc;
}

void CommandDispatcher::RegisterHandler(std::unique_ptr<ICommandHandler> handler) {
	handlers_.push_back(std::move(handler));
}

void CommandDispatcher::ProcessCommands(const json& commands) {
	if (!commands.is_array()) return;

	for (size_t i = 0; i < commands.size(); i++) {
		ExecuteCommand(commands[i]);
	}
}

bool CommandDispatcher::ExecuteCommand(const json& command) {
	if (!command.contains("commandId") && !command.contains("commandType")) {
		return false;
	}

	// Parse commandId (handles both int and string formats)
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

	Logger::Info("[CommandDispatcher] Executing: " + commandType
		+ " (ID: " + std::to_string(commandId) + ")");

	// Find the handler for this command type
	ICommandHandler* handler = FindHandler(commandType);
	if (!handler) {
		Logger::Warning("[CommandDispatcher] Unknown command type: " + commandType);
		CommandResult result;
		result.commandId = commandId;
		result.status = AgentConstants::STATUS_FAILED;
		result.errorMessage = "Unknown command type: " + commandType;
		SendCommandResult(commandId, result);
		return false;
	}

	// Parse commandData if present
	json data;
	if (command.contains("commandData")) {
		std::string rawData = command["commandData"].get<std::string>();
		try {
			data = json::parse(rawData);
		} catch (...) {
			// For simple string data (e.g. UpdateConfig), pass as-is
			data = rawData;
		}
	}

	// Dispatch to handler
	CommandResult result = handler->Execute(commandId, commandType, data, ctx_);

	// Some handlers (deploy, reset, settings) send their own results.
	// Only auto-send if the handler didn't already.
	if (!result.resultData.empty() || !result.errorMessage.empty() || result.success) {
		SendCommandResult(commandId, result);
	}

	return result.success;
}

ICommandHandler* CommandDispatcher::FindHandler(const std::string& commandType) {
	// Check cache first
	auto it = dispatchMap_.find(commandType);
	if (it != dispatchMap_.end()) {
		return it->second;
	}

	// Linear search through handlers
	for (auto& handler : handlers_) {
		if (handler->CanHandle(commandType)) {
			dispatchMap_[commandType] = handler.get();
			return handler.get();
		}
	}

	return nullptr;
}

void CommandDispatcher::SendCommandResult(int commandId, const CommandResult& result) {
	json request;
	request["commandId"] = commandId;
	request["status"] = result.status;
	request["resultData"] = result.resultData;
	request["errorMessage"] = result.errorMessage;

	json response;
	if (ctx_.httpClient) {
		ctx_.httpClient->Post(AgentConstants::ENDPOINT_COMMAND_RESULT, request, response);
	}
}
