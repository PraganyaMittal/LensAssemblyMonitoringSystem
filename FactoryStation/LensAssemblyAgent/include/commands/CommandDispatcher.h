#pragma once

// ============================================================================
// CommandDispatcher.h — Registry-based command routing
// ============================================================================
// Replaces the monolithic if/else chain in CommandExecutor with a dispatch map.
// Handlers self-register their supported command types at startup.
// ============================================================================

#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "commands/ICommandHandler.h"
#include "core/Logger.h"

using json = nlohmann::json;

class CommandDispatcher {
public:
	CommandDispatcher(RestClient* httpClient, ConfigService* configSvc,
	                  ModelService* modelSvc);
	~CommandDispatcher() = default;

	/// Set optional services (may not be available at construction time).
	void SetSyncWorker(SyncWorker* sw) { ctx_.syncWorker = sw; }
	void SetModelDeployer(ModelDeployer* md) { ctx_.modelDeployer = md; }

	/// Register a handler. The dispatcher takes ownership.
	void RegisterHandler(std::unique_ptr<ICommandHandler> handler);

	/// Process an array of commands from heartbeat/WebSocket.
	void ProcessCommands(const json& commands);

	/// Execute a single command JSON object.
	bool ExecuteCommand(const json& command);

private:
	/// Send command result back to the server.
	void SendCommandResult(int commandId, const CommandResult& result);

	/// Find the handler for a given command type.
	ICommandHandler* FindHandler(const std::string& commandType);

	CommandContext ctx_;
	std::vector<std::unique_ptr<ICommandHandler>> handlers_;

	// Fast lookup cache: commandType -> handler pointer (non-owning)
	std::unordered_map<std::string, ICommandHandler*> dispatchMap_;
};
