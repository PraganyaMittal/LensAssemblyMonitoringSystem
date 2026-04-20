#include "pch.h"
#include "UpdateConfig.h"
#include "DeploymentContext.h"
#include "DeploymentOrchestrator.h"
#include "StrategyFactory.h"
#include "ExeNames.h"

namespace fs = std::filesystem;
using namespace AutoUpdater;

// ── Result File Writer ──

/// <summary>
/// Write the deployment result to .update_result for the Agent to pick up.
/// Format: exitCode|operationType|reason
/// The Agent's CheckUpdateResult() reads this file on heartbeat and reports to the server.
/// </summary>
static void WriteUpdateResult(int exitCode, const DeploymentContext& context, const std::string& reason) {
	std::wstring resultPath = context.paths.BASE_DIR + L".update_result";
	try {
		std::ofstream f(resultPath);
		f << exitCode << "|" << context.GetResultOperationType() << "|" << reason << std::endl;
		f.close();
	}
	catch (...) {
		std::cerr << "[AutoUpdater] WARNING: Could not write .update_result" << std::endl;
	}
}

// ── Argument Parser ──

/// <summary>
/// Parse command-line arguments into a DeploymentContext.
/// 
/// Required arguments:
///   --base-dir <path>      Base installation directory (e.g., C:\LAMS_Dirs\)
///   --type <Bundle|LAI>    Deployment type
/// 
/// Optional arguments:
///   --rollback             Flag indicating this is a rollback operation
///   --recover              Flag indicating crash recovery mode
///   --agent-exe <name>     Agent executable name (default from ExeNames.h)
///   --service-name <name>  SCM service name (default from ExeNames.h)
///   --lai-exe <name>       LAI executable name (default from ExeNames.h)
///   --updater-exe <name>   AutoUpdater executable name (default from ExeNames.h)
/// </summary>
static std::optional<DeploymentContext> ParseArguments(int argc, wchar_t* argv[]) {
	DeploymentContext context;
	context.isRollback = false;
	context.isRecovery = false;
	context.type = UpdateConfig::UpdateType::UNKNOWN;

	// Defaults from ExeNames.h
	context.runtime.agentExe = EXE_NAME_AGENT_W;
	context.runtime.serviceName = SERVICE_SCM_NAME_W;
	context.runtime.laiExe = EXE_NAME_LAI_W;
	context.runtime.updaterExe = EXE_NAME_UPDATER_W;

	std::wstring baseDir;
	std::wstring typeStr;

	for (int i = 1; i < argc; i++) {
		std::wstring arg = argv[i];

		if (arg == L"--base-dir" && i + 1 < argc) {
			baseDir = argv[++i];
			if (!baseDir.empty() && baseDir.back() != L'\\') baseDir += L'\\';
		}
		else if (arg == L"--type" && i + 1 < argc) {
			typeStr = argv[++i];
		}
		else if (arg == L"--rollback") {
			context.isRollback = true;
		}
		else if (arg == L"--recover") {
			context.isRecovery = true;
		}
		else if (arg == L"--agent-exe" && i + 1 < argc) {
			context.runtime.agentExe = argv[++i];
		}
		else if (arg == L"--service-name" && i + 1 < argc) {
			context.runtime.serviceName = argv[++i];
		}
		else if (arg == L"--lai-exe" && i + 1 < argc) {
			context.runtime.laiExe = argv[++i];
		}
		else if (arg == L"--updater-exe" && i + 1 < argc) {
			context.runtime.updaterExe = argv[++i];
		}
	}

	// Validate required arguments
	if (baseDir.empty()) {
		std::cerr << "[AutoUpdater] ERROR: --base-dir is required." << std::endl;
		return std::nullopt;
	}

	// Parse type
	if (typeStr == L"Bundle" || typeStr == L"bundle" || typeStr == L"BUNDLE") {
		context.type = UpdateConfig::UpdateType::BUNDLE;
	}
	else if (typeStr == L"LAI" || typeStr == L"lai") {
		context.type = UpdateConfig::UpdateType::LAI;
	}
	else if (!context.isRecovery) {
		// Type is required unless in recovery mode
		std::cerr << "[AutoUpdater] ERROR: --type must be 'Bundle' or 'LAI'." << std::endl;
		return std::nullopt;
	}

	// Initialize paths from base directory
	context.paths.InitFromBaseDir(baseDir);

	return context;
}

// ── Entry Point ──

/// <summary>
/// AutoUpdater entry point.
/// 
/// This is intentionally minimal — all logic is delegated to:
///   - DeploymentContext:     configuration
///   - StrategyFactory:       strategy selection
///   - DeploymentOrchestrator: execution pipeline
/// 
/// Zero if-else branching. Zero type-checking. Open for extension, closed for modification.
/// </summary>
int wmain(int argc, wchar_t* argv[]) {
	// ── Parse Arguments ──
	auto context = ParseArguments(argc, argv);
	if (!context.has_value()) {
		std::cerr << "[AutoUpdater] Invalid arguments. Usage:" << std::endl;
		std::cerr << "  AutoUpdater.exe --base-dir <path> --type <Bundle|LAI> [--rollback] [--recover]" << std::endl;
		return UpdateConfig::EXIT_BAD_ARGS;
	}

	// ── Create Strategy ──
	auto strategy = StrategyFactory::Create(context.value());
	if (!strategy) {
		std::cerr << "[AutoUpdater] Failed to create deployment strategy." << std::endl;
		WriteUpdateResult(UpdateConfig::EXIT_BAD_ARGS, context.value(), "Unknown deployment type");
		return UpdateConfig::EXIT_BAD_ARGS;
	}

	// ── Execute Pipeline ──
	DeploymentOrchestrator orchestrator(std::move(strategy), context.value());
	int exitCode = orchestrator.Execute();

	// ── Write Result ──
	std::string reason = (exitCode == UpdateConfig::EXIT_SUCCESS_CODE)
		? "Completed successfully"
		: "Failed at " + std::string(UpdateConfig::StateToString(
			static_cast<UpdateConfig::UpdateState>(exitCode)));

	WriteUpdateResult(exitCode, context.value(), reason);

	return exitCode;
}
