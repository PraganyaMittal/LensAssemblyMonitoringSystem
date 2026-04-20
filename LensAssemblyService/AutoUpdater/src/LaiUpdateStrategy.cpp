#include "pch.h"
#include "LaiUpdateStrategy.h"
#include "AtomicFileReplacer.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "HealthChecker.h"
#include "UpdaterModules.h"
#include <LogEngine.h>

namespace fs = std::filesystem;
using namespace AutoUpdater;

static constexpr const char* MOD = "LaiStrategy";

LaiUpdateStrategy::LaiUpdateStrategy(const DeploymentContext& context)
	: context_(context) {}

// ── Stop LAI Process ──

bool LaiUpdateStrategy::StopProcesses() {
	LogEngine::Info(MOD, "Stopping LAI process...");
	if (!ProcessController::StopLAI()) {
		LogEngine::Error(MOD, "Failed to stop LAI.");
		return false;
	}

	LogEngine::Info(MOD, "LAI process stopped.");
	return true;
}

// ── Backup entire LAI directory ──

bool LaiUpdateStrategy::CreateBackup() {
	if (context_.isRollback) {
		LogEngine::Info(MOD, "Rollback mode — skipping backup (already exists).");
		return true;
	}

	LogEngine::Info(MOD, "Backing up entire LAI directory...");
	if (!BackupManager::BackupDirectory(context_.paths.LAI_DIR, context_.paths.BACKUP_LAI_DIR)) {
		LogEngine::Error(MOD, "Backup FAILED.");
		return false;
	}

	// Write backup manifest for validation
	if (!BackupManager::WriteBackupManifest(context_.paths.BACKUP_LAI_DIR, "LAI")) {
		LogEngine::Warning(MOD, "Backup manifest write failed.");
	}

	LogEngine::Info(MOD, "Backup complete.");
	return true;
}

// ── Replace files ──

bool LaiUpdateStrategy::ReplaceFiles() {
	std::wstring sourceDir = context_.GetSourceDir();
	std::wstring targetDir = context_.GetTargetDir();
	std::wstring manifestPath = context_.paths.UPDATE_DIR + L".update_manifest";

	// LAI uses full directory replacement: wipe target then copy from staging
	// No exclusions for LAI (unlike Bundle which excludes AutoUpdater.exe)
	std::vector<std::wstring> exclusions;  // empty — replace everything

	// Wipe existing LAI directory for a clean install
	LogEngine::Info(MOD, "Wiping existing LAI directory...");
	try {
		if (fs::exists(targetDir)) {
			fs::remove_all(targetDir);
			LogEngine::Info(MOD, "LAI directory wiped.");
		}
		fs::create_directories(targetDir);
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, std::string("Failed to wipe LAI directory: ") + ex.what());
		return false;
	}

	// For LAI, since we wiped the target, we use a simpler copy (no .old rename needed)
	// But we still use AtomicFileReplacer for consistency and manifest support
	LogEngine::Info(MOD, "Installing LAI files from staging...");
	auto result = AtomicFileReplacer::ReplaceAtomically(sourceDir, targetDir, exclusions, manifestPath);

	if (!result.success) {
		LogEngine::Error(MOD, "File replacement FAILED: " + result.errorMessage);
		return false;
	}

	LogEngine::Info(MOD, "Replaced " + std::to_string(result.replacedFiles) + " files.");
	return true;
}

// ── Restart LAI ──

bool LaiUpdateStrategy::RestartProcesses() {
	LogEngine::Info(MOD, "Starting LAI process...");
	if (!ProcessController::StartLAI()) {
		LogEngine::Error(MOD, "Failed to start LAI.");
		return false;
	}

	LogEngine::Info(MOD, "LAI process started.");
	return true;
}

// ── Health Verification ──

bool LaiUpdateStrategy::VerifyHealth() {
	LogEngine::Info(MOD, "Verifying LAI health...");

	if (!HealthChecker::VerifyLAI()) {
		LogEngine::Error(MOD, "Health verification FAILED.");
		return false;
	}

	LogEngine::Info(MOD, "Health verification passed.");
	return true;
}

// ── Cleanup ──

void LaiUpdateStrategy::Cleanup(bool success) {
	if (success) {
		LogEngine::Info(MOD, std::string("Cleaning up after successful ")
			+ (context_.isRollback ? "rollback" : "update") + "...");

		// Clean staging directory
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
				LogEngine::Info(MOD, "Staging directory cleaned.");
			}
		}
		catch (const std::exception& ex) {
			LogEngine::Warning(MOD, std::string("Staging cleanup failed: ") + ex.what());
		}

		// Remove update marker
		try {
			if (fs::exists(context_.paths.UPDATE_MARKER_FILE)) {
				fs::remove(context_.paths.UPDATE_MARKER_FILE);
			}
		}
		catch (...) {}

		// For rollback: clean backup (no rollback-of-rollback)
		if (context_.isRollback) {
			try {
				if (fs::exists(context_.paths.BACKUP_LAI_DIR)) {
					fs::remove_all(context_.paths.BACKUP_LAI_DIR);
					LogEngine::Info(MOD, "Backup directory cleaned (rollback complete).");
				}
				if (fs::exists(context_.paths.BACKUP_DIR) && fs::is_empty(context_.paths.BACKUP_DIR)) {
					fs::remove(context_.paths.BACKUP_DIR);
				}
			}
			catch (const std::exception& ex) {
				LogEngine::Warning(MOD, std::string("Backup cleanup failed: ") + ex.what());
			}
		}
	}
	else {
		LogEngine::Error(MOD, "Cleanup after FAILURE...");

		// For LAI failure: attempt to restore from backup if it exists
		if (fs::exists(context_.paths.BACKUP_LAI_DIR)) {
			LogEngine::Error(MOD, "Attempting to restore from backup...");
			try {
				std::wstring targetDir = context_.GetTargetDir();
				if (fs::exists(targetDir)) {
					fs::remove_all(targetDir);
				}
				fs::copy(context_.paths.BACKUP_LAI_DIR, targetDir,
					fs::copy_options::recursive | fs::copy_options::overwrite_existing);
				LogEngine::Info(MOD, "Restored from backup successfully.");
			}
			catch (const std::exception& ex) {
				LogEngine::Error(MOD, std::string("CRITICAL: Backup restoration failed: ") + ex.what());
			}
		}

		// Clean staging
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
			}
		}
		catch (...) {}

		LogEngine::Error(MOD, "Backup preserved for retry.");
	}
}
