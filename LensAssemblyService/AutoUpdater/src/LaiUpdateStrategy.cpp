#include "pch.h"
#include "LaiUpdateStrategy.h"
#include "AtomicFileReplacer.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "HealthChecker.h"

namespace fs = std::filesystem;
using namespace AutoUpdater;

LaiUpdateStrategy::LaiUpdateStrategy(const DeploymentContext& context)
	: context_(context) {}

// ── Stop LAI Process ──

bool LaiUpdateStrategy::StopProcesses() {
	std::cout << "[LAI] Stopping LAI process..." << std::endl;
	if (!ProcessController::StopLAI()) {
		std::cerr << "[LAI] Failed to stop LAI." << std::endl;
		return false;
	}

	std::cout << "[LAI] LAI process stopped." << std::endl;
	return true;
}

// ── Backup entire LAI directory ──

bool LaiUpdateStrategy::CreateBackup() {
	if (context_.isRollback) {
		std::cout << "[LAI] Rollback mode — skipping backup (already exists)." << std::endl;
		return true;
	}

	std::cout << "[LAI] Backing up entire LAI directory..." << std::endl;
	if (!BackupManager::BackupDirectory(context_.paths.LAI_DIR, context_.paths.BACKUP_LAI_DIR)) {
		std::cerr << "[LAI] Backup FAILED." << std::endl;
		return false;
	}

	// Write backup manifest for validation
	if (!BackupManager::WriteBackupManifest(context_.paths.BACKUP_LAI_DIR, "LAI")) {
		std::cerr << "[LAI] WARNING: Backup manifest write failed." << std::endl;
	}

	std::cout << "[LAI] Backup complete." << std::endl;
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
	std::cout << "[LAI] Wiping existing LAI directory..." << std::endl;
	try {
		if (fs::exists(targetDir)) {
			fs::remove_all(targetDir);
			std::cout << "[LAI] LAI directory wiped." << std::endl;
		}
		fs::create_directories(targetDir);
	}
	catch (const std::exception& ex) {
		std::cerr << "[LAI] Failed to wipe LAI directory: " << ex.what() << std::endl;
		return false;
	}

	// For LAI, since we wiped the target, we use a simpler copy (no .old rename needed)
	// But we still use AtomicFileReplacer for consistency and manifest support
	std::cout << "[LAI] Installing LAI files from staging..." << std::endl;
	auto result = AtomicFileReplacer::ReplaceAtomically(sourceDir, targetDir, exclusions, manifestPath);

	if (!result.success) {
		std::cerr << "[LAI] File replacement FAILED: " << result.errorMessage << std::endl;
		return false;
	}

	std::cout << "[LAI] Replaced " << result.replacedFiles << " files." << std::endl;
	return true;
}

// ── Restart LAI ──

bool LaiUpdateStrategy::RestartProcesses() {
	std::cout << "[LAI] Starting LAI process..." << std::endl;
	if (!ProcessController::StartLAI()) {
		std::cerr << "[LAI] Failed to start LAI." << std::endl;
		return false;
	}

	std::cout << "[LAI] LAI process started." << std::endl;
	return true;
}

// ── Health Verification ──

bool LaiUpdateStrategy::VerifyHealth() {
	std::cout << "[LAI] Verifying LAI health..." << std::endl;

	if (!HealthChecker::VerifyLAI()) {
		std::cerr << "[LAI] Health verification FAILED." << std::endl;
		return false;
	}

	std::cout << "[LAI] Health verification passed." << std::endl;
	return true;
}

// ── Cleanup ──

void LaiUpdateStrategy::Cleanup(bool success) {
	if (success) {
		std::cout << "[LAI] Cleaning up after successful "
			<< (context_.isRollback ? "rollback" : "update") << "..." << std::endl;

		// Clean staging directory
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
				std::cout << "[LAI] Staging directory cleaned." << std::endl;
			}
		}
		catch (const std::exception& ex) {
			std::cerr << "[LAI] Warning: Staging cleanup failed: " << ex.what() << std::endl;
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
					std::cout << "[LAI] Backup directory cleaned (rollback complete)." << std::endl;
				}
				if (fs::exists(context_.paths.BACKUP_DIR) && fs::is_empty(context_.paths.BACKUP_DIR)) {
					fs::remove(context_.paths.BACKUP_DIR);
				}
			}
			catch (const std::exception& ex) {
				std::cerr << "[LAI] Warning: Backup cleanup failed: " << ex.what() << std::endl;
			}
		}
	}
	else {
		std::cerr << "[LAI] Cleanup after FAILURE..." << std::endl;

		// For LAI failure: attempt to restore from backup if it exists
		if (fs::exists(context_.paths.BACKUP_LAI_DIR)) {
			std::cerr << "[LAI] Attempting to restore from backup..." << std::endl;
			try {
				std::wstring targetDir = context_.GetTargetDir();
				if (fs::exists(targetDir)) {
					fs::remove_all(targetDir);
				}
				fs::copy(context_.paths.BACKUP_LAI_DIR, targetDir,
					fs::copy_options::recursive | fs::copy_options::overwrite_existing);
				std::cerr << "[LAI] Restored from backup successfully." << std::endl;
			}
			catch (const std::exception& ex) {
				std::cerr << "[LAI] CRITICAL: Backup restoration failed: " << ex.what() << std::endl;
			}
		}

		// Clean staging
		try {
			if (fs::exists(context_.paths.UPDATE_DIR)) {
				fs::remove_all(context_.paths.UPDATE_DIR);
			}
		}
		catch (...) {}

		std::cerr << "[LAI] Backup preserved for retry." << std::endl;
	}
}
