#include "pch.h"
#include "BundleUpdateStrategy.h"
#include "AtomicFileReplacer.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "HealthChecker.h"

namespace fs = std::filesystem;
using namespace AutoUpdater;

BundleUpdateStrategy::BundleUpdateStrategy(const DeploymentContext& context)
	: context_(context) {}

// ── Stop Agent + Service ──

bool BundleUpdateStrategy::StopProcesses() {
	std::cout << "[Bundle] Stopping Agent..." << std::endl;
	if (!ProcessController::StopAgent()) {
		std::cerr << "[Bundle] Failed to stop Agent." << std::endl;
		return false;
	}

	std::cout << "[Bundle] Stopping Service..." << std::endl;
	if (!ProcessController::StopService()) {
		std::cerr << "[Bundle] Failed to stop Service." << std::endl;
		return false;
	}

	std::cout << "[Bundle] All processes stopped." << std::endl;
	return true;
}

// ── Backup entire Bundle directory ──

bool BundleUpdateStrategy::CreateBackup() {
	if (context_.isRollback) {
		std::cout << "[Bundle] Rollback mode — skipping backup (already exists)." << std::endl;
		return true;
	}

	std::cout << "[Bundle] Backing up entire Bundle directory..." << std::endl;
	if (!BackupManager::BackupDirectory(context_.paths.BUNDLE_DIR, context_.paths.BACKUP_BUNDLE_DIR)) {
		std::cerr << "[Bundle] Backup FAILED." << std::endl;
		return false;
	}

	// Write backup manifest for validation
	if (!BackupManager::WriteBackupManifest(context_.paths.BACKUP_BUNDLE_DIR, "Bundle")) {
		std::cerr << "[Bundle] WARNING: Backup manifest write failed. Backup is valid but unverifiable." << std::endl;
		// Non-fatal: backup exists, just the manifest didn't get written
	}

	std::cout << "[Bundle] Backup complete." << std::endl;
	return true;
}

// ── Replace files atomically ──

bool BundleUpdateStrategy::ReplaceFiles() {
	std::wstring sourceDir = context_.GetSourceDir();
	std::wstring targetDir = context_.GetTargetDir();
	auto exclusions = context_.GetReplacementExclusions();
	std::wstring manifestPath = context_.paths.UPDATE_DIR + L".update_manifest";

	std::cout << "[Bundle] Starting atomic file replacement..." << std::endl;
	std::cout << "[Bundle]   Source:     " << UpdateConfig::WtoA(sourceDir) << std::endl;
	std::cout << "[Bundle]   Target:     " << UpdateConfig::WtoA(targetDir) << std::endl;
	std::cout << "[Bundle]   Exclusions: " << exclusions.size() << " file(s)" << std::endl;

	auto result = AtomicFileReplacer::ReplaceAtomically(sourceDir, targetDir, exclusions, manifestPath);

	if (!result.success) {
		std::cerr << "[Bundle] Atomic replacement FAILED: " << result.errorMessage << std::endl;
		std::cerr << "[Bundle] Machine state has been restored to pre-operation state." << std::endl;
		return false;
	}

	std::cout << "[Bundle] Replaced " << result.replacedFiles << "/" << result.totalFiles << " files." << std::endl;
	return true;
}

// ── Restart Service + Agent ──

bool BundleUpdateStrategy::RestartProcesses() {
	std::cout << "[Bundle] Starting Service..." << std::endl;
	if (!ProcessController::StartService()) {
		std::cerr << "[Bundle] Failed to start Service." << std::endl;
		return false;
	}

	std::cout << "[Bundle] Starting Agent..." << std::endl;
	if (!ProcessController::StartAgent()) {
		std::cerr << "[Bundle] Failed to start Agent." << std::endl;
		return false;
	}

	std::cout << "[Bundle] All processes started." << std::endl;
	return true;
}

// ── Health Verification ──

bool BundleUpdateStrategy::VerifyHealth() {
	std::cout << "[Bundle] Verifying system health..." << std::endl;

	if (!HealthChecker::VerifyBundle()) {
		std::cerr << "[Bundle] Health verification FAILED." << std::endl;
		return false;
	}

	std::cout << "[Bundle] Health verification passed." << std::endl;
	return true;
}

// ── Cleanup ──

void BundleUpdateStrategy::Cleanup(bool success) {
	if (success) {
		std::cout << "[Bundle] Cleaning up after successful "
			<< (context_.isRollback ? "rollback" : "update") << "..." << std::endl;

		// Clean staging directory
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
				std::cout << "[Bundle] Staging directory cleaned." << std::endl;
			}
		}
		catch (const std::exception& ex) {
			std::cerr << "[Bundle] Warning: Staging cleanup failed: " << ex.what() << std::endl;
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
					std::cout << "[Bundle] Backup directory cleaned (rollback complete, no re-rollback)." << std::endl;
				}
				// Remove parent backup dir if empty
				if (fs::exists(context_.paths.BACKUP_DIR) && fs::is_empty(context_.paths.BACKUP_DIR)) {
					fs::remove(context_.paths.BACKUP_DIR);
				}
			}
			catch (const std::exception& ex) {
				std::cerr << "[Bundle] Warning: Backup cleanup failed: " << ex.what() << std::endl;
			}
		}
	}
	else {
		std::cerr << "[Bundle] Cleanup after FAILURE..." << std::endl;

		// Clean staging but keep backup intact for retry
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
			}
		}
		catch (...) {}

		// Note: AtomicFileReplacer already rolled back file changes internally.
		// Backup directory is preserved so user can retry rollback.
		std::cerr << "[Bundle] Backup preserved for retry." << std::endl;
	}
}
