#include "pch.h"
#include "BundleUpdateStrategy.h"
#include "AtomicFileReplacer.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "HealthChecker.h"
#include "UpdaterModules.h"
#include <LogEngine.h>

namespace fs = std::filesystem;
using namespace AutoUpdater;

static constexpr const char* MOD = "BundleStrategy";

BundleUpdateStrategy::BundleUpdateStrategy(const DeploymentContext& context)
	: context_(context) {}

// ── Stop Agent + Service ──

bool BundleUpdateStrategy::StopProcesses() {
	LogEngine::Info(MOD, "Stopping Agent...");
	if (!ProcessController::StopAgent(context_.runtime)) {
		LogEngine::Error(MOD, "Failed to stop Agent.");
		return false;
	}

	LogEngine::Info(MOD, "Stopping Service...");
	if (!ProcessController::StopService(context_.runtime)) {
		LogEngine::Error(MOD, "Failed to stop Service.");
		return false;
	}

	LogEngine::Info(MOD, "All processes stopped.");
	return true;
}

// ── Backup entire Bundle directory ──

bool BundleUpdateStrategy::CreateBackup() {
	if (context_.isRollback) {
		LogEngine::Info(MOD, "Rollback mode — skipping backup (already exists).");
		return true;
	}

	LogEngine::Info(MOD, "Backing up entire Bundle directory...");
	if (!BackupManager::BackupDirectory(context_.paths.BUNDLE_DIR, context_.paths.BACKUP_BUNDLE_DIR)) {
		LogEngine::Error(MOD, "Backup FAILED.");
		return false;
	}

	// Write backup manifest for validation
	if (!BackupManager::WriteBackupManifest(context_.paths.BACKUP_BUNDLE_DIR, "Bundle")) {
		LogEngine::Warning(MOD, "Backup manifest write failed. Backup is valid but unverifiable.");
		// Non-fatal: backup exists, just the manifest didn't get written
	}

	LogEngine::Info(MOD, "Backup complete.");
	return true;
}

// ── Replace files atomically ──

bool BundleUpdateStrategy::ReplaceFiles() {
	std::wstring sourceDir = context_.GetSourceDir();
	std::wstring targetDir = context_.GetTargetDir();
	auto exclusions = context_.GetReplacementExclusions();
	std::wstring manifestPath = context_.paths.UPDATE_DIR + L".update_manifest";

	LogEngine::Info(MOD, "Starting atomic file replacement...");
	LogEngine::Info(MOD, "  Source:     " + UpdateConfig::WtoA(sourceDir));
	LogEngine::Info(MOD, "  Target:     " + UpdateConfig::WtoA(targetDir));
	LogEngine::Info(MOD, "  Exclusions: " + std::to_string(exclusions.size()) + " file(s)");

	auto result = AtomicFileReplacer::ReplaceAtomically(sourceDir, targetDir, exclusions, manifestPath);

	if (!result.success) {
		LogEngine::Error(MOD, "Atomic replacement FAILED: " + result.errorMessage);
		LogEngine::Error(MOD, "Machine state has been restored to pre-operation state.");
		return false;
	}

	LogEngine::Info(MOD, "Replaced " + std::to_string(result.replacedFiles)
		+ "/" + std::to_string(result.totalFiles) + " files.");
	return true;
}

// ── Restart Service + Agent ──

bool BundleUpdateStrategy::RestartProcesses() {
	LogEngine::Info(MOD, "Starting Service...");
	if (!ProcessController::StartService(context_.runtime)) {
		LogEngine::Error(MOD, "Failed to start Service.");
		return false;
	}

	LogEngine::Info(MOD, "Starting Agent...");
	if (!ProcessController::StartAgent(context_.paths, context_.runtime)) {
		LogEngine::Error(MOD, "Failed to start Agent.");
		return false;
	}

	LogEngine::Info(MOD, "All processes started.");
	return true;
}

// ── Health Verification ──

bool BundleUpdateStrategy::VerifyHealth() {
	LogEngine::Info(MOD, "Verifying system health...");

	if (!HealthChecker::VerifyBundle(context_.paths, context_.runtime)) {
		LogEngine::Error(MOD, "Health verification FAILED.");
		return false;
	}

	LogEngine::Info(MOD, "Health verification passed.");
	return true;
}

// ── Cleanup ──

void BundleUpdateStrategy::Cleanup(bool success) {
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

		// For rollback: also clean backup (no rollback-of-rollback)
		if (context_.isRollback) {
			try {
				if (fs::exists(context_.paths.BACKUP_BUNDLE_DIR)) {
					fs::remove_all(context_.paths.BACKUP_BUNDLE_DIR);
					LogEngine::Info(MOD, "Backup directory cleaned (rollback complete, no re-rollback).");
				}
				// Remove parent backup dir if empty
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

		// Clean staging but keep backup intact for retry
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
			}
		}
		catch (...) {}

		// Note: AtomicFileReplacer already rolled back file changes internally.
		// Backup directory is preserved so user can retry rollback.
		LogEngine::Error(MOD, "Backup preserved for retry.");
	}
}
