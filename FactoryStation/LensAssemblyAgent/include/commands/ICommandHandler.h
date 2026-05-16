#pragma once

// ============================================================================
// ICommandHandler.h — Interface for individual command handlers
// ============================================================================
// Each handler implements a single responsibility: one group of related commands.
// The CommandDispatcher routes commands to the appropriate handler.
// ============================================================================

#include <string>
#include <nlohmann/json.hpp>
#include "common/Types.h"
#include "common/Constants.h"

using json = nlohmann::json;

// ── Forward declarations ──
class HttpClient;
class ConfigService;
class ModelService;
class SyncWorker;
class ModelDeployer;

/// Shared context passed to all handlers — provides access to services.
struct CommandContext {
	HttpClient* httpClient = nullptr;
	ConfigService* configService = nullptr;
	ModelService* modelService = nullptr;
	SyncWorker* syncWorker = nullptr;
	ModelDeployer* modelDeployer = nullptr;
};

/// Interface that all command handlers must implement.
class ICommandHandler {
public:
	virtual ~ICommandHandler() = default;

	/// Returns true if this handler can process the given command type.
	virtual bool CanHandle(const std::string& commandType) const = 0;

	/// Execute the command. Returns the result.
	virtual CommandResult Execute(int commandId, const std::string& commandType,
	                              const json& commandData, CommandContext& ctx) = 0;
};
