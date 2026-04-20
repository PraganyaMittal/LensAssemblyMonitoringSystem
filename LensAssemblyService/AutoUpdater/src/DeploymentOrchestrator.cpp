#include "pch.h"
#include "DeploymentOrchestrator.h"
#include "AtomicFileReplacer.h"

namespace fs = std::filesystem;
using namespace AutoUpdater;

// ── Timestamp utility ──

static std::string GetTimestamp() {
	auto now = std::chrono::system_clock::now();
	auto time = std::chrono::system_clock::to_time_t(now);
	struct tm buf;
	localtime_s(&buf, &time);
	char ts[32];
	strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", &buf);
	return std::string(ts);
}

// ── Log file (module-level, initialized in Execute) ──

static std::ofstream g_logFile;

// ── Constructor ──

DeploymentOrchestrator::DeploymentOrchestrator(
	std::unique_ptr<IDeploymentStrategy> strategy,
	const DeploymentContext& context)
	: strategy_(std::move(strategy))
	, context_(context)
	, currentState_(UpdateConfig::UpdateState::INIT)
{}

// ── Logging ──

void DeploymentOrchestrator::Log(const char* message) const {
	std::string stateStr = UpdateConfig::StateToString(currentState_);
	std::string ts = GetTimestamp();
	std::string line = "[" + ts + "] [AutoUpdater] [" + stateStr + "] " + message;
	std::cout << line << std::endl;
	if (g_logFile.is_open()) {
		g_logFile << line << std::endl;
	}
}

void DeploymentOrchestrator::LogError(const char* message) const {
	std::string stateStr = UpdateConfig::StateToString(currentState_);
	std::string ts = GetTimestamp();
	std::string line = "[" + ts + "] [AutoUpdater] [" + stateStr + "] ERROR: " + std::string(message);
	std::cerr << line << std::endl;
	if (g_logFile.is_open()) {
		g_logFile << line << std::endl;
	}
}

void DeploymentOrchestrator::TransitionTo(UpdateConfig::UpdateState newState) {
	currentState_ = newState;
	Log(("State → " + std::string(UpdateConfig::StateToString(newState))).c_str());
}

// ── Exit Code Mapping ──

int DeploymentOrchestrator::GetExitCodeForFailure(UpdateConfig::UpdateState failedState) const {
	switch (failedState) {
		case UpdateConfig::UpdateState::BACKUP:         return UpdateConfig::EXIT_BACKUP_FAILED;
		case UpdateConfig::UpdateState::STOP_PROCESSES: return UpdateConfig::EXIT_STOP_FAILED;
		case UpdateConfig::UpdateState::REPLACE_FILES:  return UpdateConfig::EXIT_REPLACE_FAILED;
		case UpdateConfig::UpdateState::RESTART:        return UpdateConfig::EXIT_RESTART_FAILED;
		case UpdateConfig::UpdateState::VERIFY:         return UpdateConfig::EXIT_HEALTHCHECK_FAILED;
		default:                                        return UpdateConfig::EXIT_REPLACE_FAILED;
	}
}

// ── Main Execution Pipeline (Template Method) ──

int DeploymentOrchestrator::Execute() {
	// ── Initialize logging ──
	try {
		fs::create_directories(context_.paths.LOG_DIR);
	}
	catch (...) {}

	std::wstring logPath = context_.paths.LOG_DIR + L"autoupdater_log.txt";
	g_logFile.open(logPath, std::ios::app);

	// ── Banner ──
	TransitionTo(UpdateConfig::UpdateState::INIT);
	Log("========================================");
	Log(("  AutoUpdater — " + context_.GetOperationName()).c_str());
	Log("========================================");
	Log(("Base dir: " + UpdateConfig::WtoA(context_.paths.BASE_DIR)).c_str());
	Log(("Type:     " + strategy_->GetTypeName()).c_str());
	Log(("Mode:     " + std::string(strategy_->IsRollback() ? "ROLLBACK" : "UPDATE")).c_str());

	// ── Recovery Mode: Handle stale manifest from previous crash ──
	if (context_.isRecovery) {
		Log("RECOVERY MODE: Detected stale manifest from previous crash.");
		std::wstring manifestPath = context_.paths.UPDATE_DIR + L".update_manifest";
		bool recovered = false;

		if (fs::exists(manifestPath)) {
			recovered = AtomicFileReplacer::RecoverFromManifest(manifestPath);
			if (recovered) {
				Log("Recovery complete. Machine state restored.");
			}
			else {
				LogError("Recovery failed. Manual intervention may be required.");
			}
		}
		else {
			Log("No manifest found. Cleaning up stale marker files.");
			recovered = true;  // No manifest = nothing to recover = success
		}

		// Clean up any remaining staging
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
			}
		}
		catch (...) {}

		g_logFile.close();
		return recovered ? UpdateConfig::EXIT_SUCCESS_CODE : UpdateConfig::EXIT_RECOVERY_FAILED;
	}

	// ── Step 1: Stop Processes ──
	TransitionTo(UpdateConfig::UpdateState::STOP_PROCESSES);
	if (!strategy_->StopProcesses()) {
		LogError("Failed to stop processes.");
		strategy_->Cleanup(false);
		g_logFile.close();
		return UpdateConfig::EXIT_STOP_FAILED;
	}
	Log("Processes stopped successfully.");

	// ── Step 2: Create Backup ──
	TransitionTo(UpdateConfig::UpdateState::BACKUP);
	if (!strategy_->CreateBackup()) {
		LogError("Backup creation failed.");
		// Attempt to restart processes before exiting
		strategy_->RestartProcesses();
		strategy_->Cleanup(false);
		g_logFile.close();
		return UpdateConfig::EXIT_BACKUP_FAILED;
	}
	Log("Backup step complete.");

	// ── Step 3: Replace Files ──
	TransitionTo(UpdateConfig::UpdateState::REPLACE_FILES);
	if (!strategy_->ReplaceFiles()) {
		LogError("File replacement failed. AtomicFileReplacer has restored original files.");
		// Attempt to restart processes with original files
		strategy_->RestartProcesses();
		strategy_->Cleanup(false);
		g_logFile.close();
		return UpdateConfig::EXIT_REPLACE_FAILED;
	}
	Log("Files replaced successfully.");

	// ── Step 4: Restart Processes ──
	TransitionTo(UpdateConfig::UpdateState::RESTART);
	if (!strategy_->RestartProcesses()) {
		LogError("Failed to restart processes after file replacement.");
		strategy_->Cleanup(false);
		g_logFile.close();
		return UpdateConfig::EXIT_RESTART_FAILED;
	}
	Log("Processes restarted successfully.");

	// ── Step 5: Verify Health ──
	TransitionTo(UpdateConfig::UpdateState::VERIFY);
	if (!strategy_->VerifyHealth()) {
		LogError("Health check failed after restart.");
		strategy_->Cleanup(false);
		g_logFile.close();
		return UpdateConfig::EXIT_HEALTHCHECK_FAILED;
	}
	Log("Health verification passed.");

	// ── Step 6: Cleanup ──
	TransitionTo(UpdateConfig::UpdateState::CLEANUP);
	strategy_->Cleanup(true);
	Log("Cleanup complete.");

	// ── Done ──
	TransitionTo(UpdateConfig::UpdateState::DONE);
	Log(("SUCCESS: " + context_.GetOperationName() + " completed.").c_str());

	g_logFile.close();
	return UpdateConfig::EXIT_SUCCESS_CODE;
}
