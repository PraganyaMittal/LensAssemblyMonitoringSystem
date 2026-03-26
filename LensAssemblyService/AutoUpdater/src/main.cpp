#include "pch.h"
#include "UpdateConfig.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "FileReplacer.h"
#include "HealthChecker.h"

namespace fs = std::filesystem;

static std::ofstream g_logFile;

static void InitLog() {
	try {
		fs::create_directories(UpdateConfig::g_Paths.LOG_DIR);
	} catch (...) {
		std::cerr << "[AutoUpdater] WARNING: Could not create log directory." << std::endl;
	}
	std::wstring logPath = UpdateConfig::g_Paths.LOG_DIR + L"autoupdater_log.txt";
	g_logFile.open(logPath, std::ios::app);
	if (!g_logFile.is_open()) {
		std::cerr << "[AutoUpdater] WARNING: Could not open log file." << std::endl;
	}
}

static std::string GetTimestamp() {
	auto now = std::chrono::system_clock::now();
	auto time = std::chrono::system_clock::to_time_t(now);
	struct tm buf;
	localtime_s(&buf, &time);
	char ts[32];
	strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", &buf);
	return std::string(ts);
}

static void Log(UpdateConfig::UpdateState state, const char* msg) {
	std::string stateStr = UpdateConfig::StateToString(state);
	std::string timestamp = GetTimestamp();
	std::cout << "[" << timestamp << "] [AutoUpdater] [" << stateStr << "] " << msg << std::endl;
	if (g_logFile.is_open()) {
		g_logFile << "[" << timestamp << "] [AutoUpdater] [" << stateStr << "] " << msg << std::endl;
	}
}

static void WriteUpdateResult(int exitCode, const std::string& reason) {
	std::wstring resultPath = UpdateConfig::g_Paths.BASE_DIR + L".update_result";
	try {
		std::ofstream f(resultPath);
		f << exitCode << "|" << reason << std::endl;
		f.close();
	} catch (...) {}
}

static int PerformRollback(UpdateConfig::UpdateType type) {
	auto state = UpdateConfig::UpdateState::ROLLBACK;
	Log(state, "Initiating Bundle auto-rollback from backup...");

	if (!BackupManager::RestoreBundleToStaging(type)) {
		Log(state, "FAILED to restore Bundle backup to staging.");
		return UpdateConfig::EXIT_ROLLBACK_FAILED;
	}

	Log(state, "Backup restored to staging. Re-running replace...");

	if (!FileReplacer::ReplaceBundle()) {
		Log(state, "FAILED to replace Bundle files during rollback.");
		return UpdateConfig::EXIT_ROLLBACK_FAILED;
	}

	Log(state, "Rollback files replaced. Restarting processes...");

	if (!ProcessController::StartService()) {
		Log(state, "FAILED to start Service after rollback.");
		return UpdateConfig::EXIT_ROLLBACK_FAILED;
	}
	if (!ProcessController::StartAgent()) {
		Log(state, "FAILED to start Agent after rollback.");
		return UpdateConfig::EXIT_ROLLBACK_FAILED;
	}

	Log(state, "Rollback completed. Processes restarted.");
	return UpdateConfig::EXIT_ROLLBACK_DONE;
}



static int RunUpdateProcedure(bool skipBackup, UpdateConfig::UpdateType type) {
	auto state = UpdateConfig::UpdateState::INIT;
	Log(state, "AutoUpdater started.");
	Log(state, ("Base dir: " + UpdateConfig::WtoA(UpdateConfig::g_Paths.BASE_DIR)).c_str());
	if (type == UpdateConfig::UpdateType::BUNDLE) {
		Log(state, "Update type: BUNDLE");
	} else if (type == UpdateConfig::UpdateType::LAI) {
		Log(state, "Update type: LAI");
	}
	if (skipBackup) {
		Log(state, "Mode: ROLLBACK (--skip-backup active, backup phase will be skipped)");
	}

	bool isResumingAfterCrash = fs::exists(UpdateConfig::g_Paths.UPDATE_MARKER_FILE);
	if (isResumingAfterCrash) {
		Log(state, "WARNING: Found .update_in_progress marker. Previous run crashed mid-update.");
		Log(state, "Skipping backup phase (existing backup is the good version).");
	}

	state = UpdateConfig::UpdateState::STOP_PROCESSES;
	bool stopFailed = false;

	if (type == UpdateConfig::UpdateType::BUNDLE) {
		Log(state, "Stopping Service and Agent (Bundle mode)...");
		if (!ProcessController::StopAgent()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to stop Agent. Setup cannot proceed safely.");
			stopFailed = true;
		}
		if (!ProcessController::StopService()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to stop Service. Setup cannot proceed safely.");
			stopFailed = true;
		}
	} else if (type == UpdateConfig::UpdateType::LAI) {
		Log(state, "Stopping LAI only (LAI mode)...");
		if (!ProcessController::StopLAI()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to stop LAI.");
			stopFailed = true;
		}
	}

	if (stopFailed) {
		return UpdateConfig::EXIT_STOP_FAILED;
	}
	Log(state, "Processes stopped.");

	if (!skipBackup && !isResumingAfterCrash) {
		state = UpdateConfig::UpdateState::BACKUP;
		if (type == UpdateConfig::UpdateType::BUNDLE) {
			Log(state, "Backing up Bundle files...");
			if (!BackupManager::BackupBundle(type)) {
				Log(state, "FAILED to backup Bundle files.");
				return UpdateConfig::EXIT_BACKUP_FAILED;
			}
		} else if (type == UpdateConfig::UpdateType::LAI) {
			Log(state, "Backing up LAI files...");
			if (!BackupManager::BackupLAI(type)) {
				Log(state, "FAILED to backup LAI.");
				return UpdateConfig::EXIT_BACKUP_FAILED;
			}
		}
		Log(state, "Backups created successfully.");
	} else if (skipBackup) {
		Log(state, "Backup phase SKIPPED (rollback mode).");
	}

	state = UpdateConfig::UpdateState::REPLACE_FILES;
	Log(state, "Replacing files from staging...");

	if (type == UpdateConfig::UpdateType::BUNDLE) {
		try {
			std::ofstream marker(UpdateConfig::g_Paths.UPDATE_MARKER_FILE);
			marker << "Update started at: " << GetTimestamp() << std::endl;
			marker.close();
		} catch (...) {
			Log(state, "WARNING: Could not write update marker file.");
		}

		if (!FileReplacer::ReplaceBundle()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to replace Bundle files.");
			if (!skipBackup) {
				int rollbackResult = PerformRollback(type);
				WriteUpdateResult(rollbackResult, "auto_rollback_replace_bundle_failed");
				return rollbackResult;
			}
			return UpdateConfig::EXIT_REPLACE_FAILED;
		}
	} else if (type == UpdateConfig::UpdateType::LAI) {
		if (!FileReplacer::ReplaceLAI()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to replace LAI files.");
			return UpdateConfig::EXIT_REPLACE_FAILED;
		}
	}
	Log(state, "Files replaced successfully.");

	state = UpdateConfig::UpdateState::RESTART;

	if (type == UpdateConfig::UpdateType::BUNDLE) {
		Log(state, "Restarting Service and Agent...");
		if (!ProcessController::StartService()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to start Service.");
			if (!skipBackup) {
				int rollbackResult = PerformRollback(type);
				WriteUpdateResult(rollbackResult, "auto_rollback_restart_service_failed");
				return rollbackResult;
			}
			return UpdateConfig::EXIT_RESTART_FAILED;
		}
		if (!ProcessController::StartAgent()) {
			Log(UpdateConfig::UpdateState::FAILED, "FAILED to start Agent.");
			if (!skipBackup) {
				int rollbackResult = PerformRollback(type);
				WriteUpdateResult(rollbackResult, "auto_rollback_restart_agent_failed");
				return rollbackResult;
			}
			return UpdateConfig::EXIT_RESTART_FAILED;
		}
		Log(state, "Service and Agent restarted.");
	} else if (type == UpdateConfig::UpdateType::LAI) {
		Log(state, "Starting LAI...");
		ProcessController::StartLAI();
		Log(state, "LAI started.");
	}

	state = UpdateConfig::UpdateState::VERIFY;

	if (type == UpdateConfig::UpdateType::BUNDLE) {
		Log(state, "Running health checks...");
		if (!HealthChecker::VerifyAll()) {
			Log(UpdateConfig::UpdateState::FAILED, "Health check FAILED.");
			if (!skipBackup) {
				int rollbackResult = PerformRollback(type);
				WriteUpdateResult(rollbackResult, "auto_rollback_healthcheck_failed");
				return rollbackResult;
			}
			return UpdateConfig::EXIT_HEALTHCHECK_FAILED;
		}
		Log(state, "All health checks passed.");
	} else if (type == UpdateConfig::UpdateType::LAI) {
		Log(state, "LAI health check: skipped.");
	}

	state = UpdateConfig::UpdateState::CLEANUP;
	Log(state, "Cleaning up staging directory...");
	FileReplacer::CleanupStaging();

	try {
		fs::remove(UpdateConfig::g_Paths.UPDATE_MARKER_FILE);
	} catch (...) {}

	state = UpdateConfig::UpdateState::DONE;
	Log(state, "Update completed successfully!");
	return UpdateConfig::EXIT_SUCCESS_CODE;
}


int wmain(int argc, wchar_t* argv[]) {
	std::wstring baseDir;
	bool skipBackup = false;
	UpdateConfig::UpdateType type = UpdateConfig::UpdateType::UNKNOWN;

	for (int i = 1; i < argc; i++) {
		std::wstring arg = argv[i];
		if (arg == L"--base-dir" && (i + 1) < argc) {
			baseDir = argv[i + 1];
			i++;
		} else if (arg == L"--skip-backup") {
			skipBackup = true;
		} else if (arg == L"--type" && (i + 1) < argc) {
			std::wstring typeStr = argv[i + 1];
			if (typeStr == L"bundle" || typeStr == L"BUNDLE") {
				type = UpdateConfig::UpdateType::BUNDLE;
			} else if (typeStr == L"lai" || typeStr == L"LAI") {
				type = UpdateConfig::UpdateType::LAI;
			}
			i++;
		}
	}

	if (baseDir.empty() || type == UpdateConfig::UpdateType::UNKNOWN) {
		std::cerr << "[AutoUpdater] ERROR: --base-dir and --type arguments are required." << std::endl;
		std::cerr << "Usage: AutoUpdater.exe --base-dir \"C:\\LAMS_Dirs\\\" --type [bundle|lai] [--skip-backup]" << std::endl;
		return UpdateConfig::EXIT_BAD_ARGS;
	}

	if (baseDir.back() != L'\\') baseDir += L'\\';

	UpdateConfig::g_Paths.InitFromBaseDir(baseDir);

	InitLog();
	Log(UpdateConfig::UpdateState::INIT, "========================================");
	Log(UpdateConfig::UpdateState::INIT, "  Factory AutoUpdater");
	Log(UpdateConfig::UpdateState::INIT, "========================================");

	int result = RunUpdateProcedure(skipBackup, type);

	std::string exitMsg = "Exit code: " + std::to_string(result);
	Log(UpdateConfig::UpdateState::DONE, exitMsg.c_str());

	WriteUpdateResult(result, result == 0 ? "success" : "failure");

	if (g_logFile.is_open()) {
		g_logFile.close();
	}
	return result;
}
