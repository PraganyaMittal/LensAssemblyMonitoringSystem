#include "pch.h"
#include "AtomicFileReplacer.h"
#include "UpdateConfig.h"
#include <LogEngine.h>

namespace fs = std::filesystem;
using namespace AutoUpdater;

static constexpr const char* MOD = "AtomicReplacer";

// ── Exclusion Check ──

bool AtomicFileReplacer::IsExcluded(const std::wstring& filename, const std::vector<std::wstring>& exclusions) {
	for (const auto& excl : exclusions) {
		if (_wcsicmp(filename.c_str(), excl.c_str()) == 0) {
			return true;
		}
	}
	return false;
}

// ── Build Operation List ──

std::vector<AtomicFileReplacer::FileOperation> AtomicFileReplacer::BuildOperationList(
	const std::wstring& sourceDir,
	const std::wstring& targetDir,
	const std::vector<std::wstring>& exclusions)
{
	std::vector<FileOperation> operations;

	if (!fs::exists(sourceDir)) {
		return operations;
	}

	for (const auto& entry : fs::recursive_directory_iterator(sourceDir)) {
		if (!entry.is_regular_file()) continue;

		// Get relative path from sourceDir (supports subdirectories)
		fs::path relativePath = fs::relative(entry.path(), sourceDir);
		std::wstring filename = relativePath.filename().wstring();

		if (IsExcluded(filename, exclusions)) {
			LogEngine::Info(MOD, "Excluded: " + UpdateConfig::WtoA(filename));
			continue;
		}

		FileOperation op;
		op.sourceFile = entry.path().wstring();
		op.targetFile = (fs::path(targetDir) / relativePath).wstring();
		op.backupFile = op.targetFile + L".old";
		op.renamed = false;
		op.copied = false;

		operations.push_back(std::move(op));
	}

	return operations;
}

// ── Manifest Write (WAL) ──

bool AtomicFileReplacer::WriteManifest(
	const std::wstring& manifestPath,
	const std::vector<FileOperation>& operations)
{
	try {
		// Ensure parent directory exists
		fs::path parentDir = fs::path(manifestPath).parent_path();
		if (!fs::exists(parentDir)) {
			fs::create_directories(parentDir);
		}

		std::wofstream manifest(manifestPath, std::ios::trunc);
		if (!manifest.is_open()) {
			LogEngine::Error(MOD, "FATAL: Cannot write manifest file.");
			return false;
		}

		// Header: version|fileCount
		manifest << L"1|" << operations.size() << std::endl;

		// Each line: sourceFile|targetFile|backupFile
		for (const auto& op : operations) {
			manifest << op.sourceFile << L"|" << op.targetFile << L"|" << op.backupFile << std::endl;
		}

		manifest.flush();
		manifest.close();

		LogEngine::Info(MOD, "Manifest written: " + std::to_string(operations.size()) + " operations.");
		return true;
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, std::string("Manifest write failed: ") + ex.what());
		return false;
	}
}

// ── Manifest Read (for crash recovery) ──

std::vector<AtomicFileReplacer::FileOperation> AtomicFileReplacer::ReadManifest(const std::wstring& manifestPath) {
	std::vector<FileOperation> operations;

	try {
		std::wifstream manifest(manifestPath);
		if (!manifest.is_open()) return operations;

		// Read header
		std::wstring header;
		std::getline(manifest, header);

		// Read operations
		std::wstring line;
		while (std::getline(manifest, line)) {
			if (line.empty()) continue;

			// Parse: sourceFile|targetFile|backupFile
			size_t pos1 = line.find(L'|');
			size_t pos2 = line.find(L'|', pos1 + 1);
			if (pos1 == std::wstring::npos || pos2 == std::wstring::npos) continue;

			FileOperation op;
			op.sourceFile = line.substr(0, pos1);
			op.targetFile = line.substr(pos1 + 1, pos2 - pos1 - 1);
			op.backupFile = line.substr(pos2 + 1);
			op.renamed = false;
			op.copied = false;

			operations.push_back(std::move(op));
		}
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, std::string("Manifest read failed: ") + ex.what());
	}

	return operations;
}

// ── Copy with Retry ──

bool AtomicFileReplacer::CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries) {
	for (int attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Ensure target directory exists (for subdirectory support)
			fs::path targetParent = fs::path(dst).parent_path();
			if (!fs::exists(targetParent)) {
				fs::create_directories(targetParent);
			}

			fs::copy_file(src, dst, fs::copy_options::overwrite_existing);
			return true;
		}
		catch (const std::exception& ex) {
			LogEngine::Warning(MOD, "Copy attempt " + std::to_string(attempt) + "/" + std::to_string(maxRetries)
				+ " failed for " + UpdateConfig::WtoA(fs::path(dst).filename().wstring())
				+ ": " + ex.what());

			if (attempt < maxRetries) {
				std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::FILE_REPLACE_RETRY_MS));
			}
		}
	}
	return false;
}

// ── Phase 1: Rename target files to .old ──

bool AtomicFileReplacer::RenamePhase(std::vector<FileOperation>& operations, int& failedAt) {
	for (int i = 0; i < static_cast<int>(operations.size()); i++) {
		auto& op = operations[i];

		// If target doesn't exist, this is a NEW file — no rename needed
		if (!fs::exists(op.targetFile)) {
			LogEngine::Info(MOD, "New file (no rename needed): "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()));
			continue;
		}

		try {
			// Remove stale .old from a previous attempt if it exists
			if (fs::exists(op.backupFile)) {
				fs::remove(op.backupFile);
			}

			fs::rename(op.targetFile, op.backupFile);
			op.renamed = true;

			LogEngine::Info(MOD, "Renamed: "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) + " -> .old");
		}
		catch (const std::exception& ex) {
			LogEngine::Error(MOD, "RENAME FAILED for "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				+ ": " + ex.what());
			failedAt = i;
			return false;
		}
	}
	return true;
}

// ── Phase 2: Copy source files to target ──

bool AtomicFileReplacer::CopyPhase(std::vector<FileOperation>& operations, int& failedAt) {
	for (int i = 0; i < static_cast<int>(operations.size()); i++) {
		auto& op = operations[i];

		if (CopyFileWithRetry(op.sourceFile, op.targetFile, UpdateConfig::FILE_REPLACE_MAX_RETRIES)) {
			op.copied = true;
			LogEngine::Info(MOD, "Installed: "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()));
		}
		else {
			LogEngine::Error(MOD, "COPY FAILED for "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				+ " after " + std::to_string(UpdateConfig::FILE_REPLACE_MAX_RETRIES) + " retries.");
			failedAt = i;
			return false;
		}
	}
	return true;
}

// ── Rollback: Restore .old files to original names ──

void AtomicFileReplacer::RollbackRenames(std::vector<FileOperation>& operations) {
	LogEngine::Warning(MOD, "ROLLING BACK: Restoring original files...");
	int restored = 0;

	for (auto& op : operations) {
		if (!op.renamed) continue;	// This file was never renamed

		try {
			// Remove the partially-copied new file if it exists
			if (op.copied || fs::exists(op.targetFile)) {
				fs::remove(op.targetFile);
			}

			// Restore original from .old
			if (fs::exists(op.backupFile)) {
				fs::rename(op.backupFile, op.targetFile);
				restored++;
			}

			op.renamed = false;
			op.copied = false;
		}
		catch (const std::exception& ex) {
			// Critical: rollback itself failed. Log but continue trying other files.
			LogEngine::Error(MOD, "CRITICAL: Rollback failed for "
				+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				+ ": " + ex.what());
		}
	}

	LogEngine::Info(MOD, "Rollback complete. Restored " + std::to_string(restored) + " files.");
}

// ── Cleanup: Delete .old files after success (with retry + reboot fallback) ──

void AtomicFileReplacer::CleanupOldFiles(const std::vector<FileOperation>& operations) {
	constexpr int MAX_DELETE_RETRIES = 3;
	constexpr DWORD DELETE_RETRY_DELAY_MS = 1000;
	int cleaned = 0;
	int retried = 0;
	int rebootScheduled = 0;

	for (const auto& op : operations) {
		if (!op.renamed) continue;
		if (!fs::exists(op.backupFile)) continue;

		std::wstring filename = fs::path(op.backupFile).filename().wstring();
		bool deleted = false;

		// Retry loop: file may be transiently locked by antivirus, SCM, or handle leak
		for (int attempt = 1; attempt <= MAX_DELETE_RETRIES; attempt++) {
			try {
				fs::remove(op.backupFile);
				deleted = true;
				cleaned++;
				break;
			}
			catch (const std::exception& ex) {
				if (attempt < MAX_DELETE_RETRIES) {
					LogEngine::Warning(MOD, "Delete attempt " + std::to_string(attempt)
						+ "/" + std::to_string(MAX_DELETE_RETRIES)
						+ " failed for " + UpdateConfig::WtoA(filename)
						+ ": " + ex.what() + ". Retrying...");
					std::this_thread::sleep_for(std::chrono::milliseconds(DELETE_RETRY_DELAY_MS));
					retried++;
				}
				else {
					LogEngine::Error(MOD, "All " + std::to_string(MAX_DELETE_RETRIES)
						+ " delete attempts failed for " + UpdateConfig::WtoA(filename)
						+ ": " + ex.what());
				}
			}
		}

		// Ultimate fallback: schedule OS-level deletion on next reboot
		if (!deleted) {
			if (MoveFileExW(op.backupFile.c_str(), NULL, MOVEFILE_DELAY_UNTIL_REBOOT)) {
				rebootScheduled++;
				LogEngine::Warning(MOD, "Scheduled " + UpdateConfig::WtoA(filename)
					+ " for deletion on next reboot (MOVEFILE_DELAY_UNTIL_REBOOT).");
			}
			else {
				LogEngine::Error(MOD, "FAILED to schedule reboot-delete for "
					+ UpdateConfig::WtoA(filename)
					+ ". Error: " + std::to_string(GetLastError())
					+ ". File will remain on disk until manually removed.");
			}
		}
	}

	// Summary log
	LogEngine::Info(MOD, "Cleanup complete: " + std::to_string(cleaned) + " deleted"
		+ (retried > 0 ? ", " + std::to_string(retried) + " retried" : "")
		+ (rebootScheduled > 0 ? ", " + std::to_string(rebootScheduled) + " scheduled for reboot-delete" : "")
		+ ".");
}

// ── Main Entry: Atomic Replacement ──

AtomicFileReplacer::ReplaceResult AtomicFileReplacer::ReplaceAtomically(
	const std::wstring& sourceDir,
	const std::wstring& targetDir,
	const std::vector<std::wstring>& exclusions,
	const std::wstring& manifestPath)
{
	ReplaceResult result;

	// ── Step 1: Build operation list ──
	LogEngine::Info(MOD, "Building file operation list...");
	LogEngine::Info(MOD, "  Source: " + UpdateConfig::WtoA(sourceDir));
	LogEngine::Info(MOD, "  Target: " + UpdateConfig::WtoA(targetDir));

	auto operations = BuildOperationList(sourceDir, targetDir, exclusions);
	result.totalFiles = static_cast<int>(operations.size());

	if (operations.empty()) {
		result.success = false;
		result.errorMessage = "No files found in source directory";
		LogEngine::Error(MOD, result.errorMessage);
		return result;
	}

	LogEngine::Info(MOD, std::to_string(result.totalFiles) + " files to replace ("
		+ std::to_string(exclusions.size()) + " excluded).");

	// ── Step 2: Write manifest (WAL checkpoint) ──
	if (!WriteManifest(manifestPath, operations)) {
		result.success = false;
		result.errorMessage = "Failed to write operation manifest";
		return result;
	}

	// ── Step 3: Phase 1 — Rename originals to .old ──
	LogEngine::Info(MOD, "Phase 1: Renaming target files to .old...");
	int failedAt = -1;

	if (!RenamePhase(operations, failedAt)) {
		LogEngine::Error(MOD, "Phase 1 FAILED at file " + std::to_string(failedAt)
			+ ". Rolling back all renames.");
		RollbackRenames(operations);

		// Clean up manifest since we're fully rolled back
		try { fs::remove(manifestPath); } catch (...) {}

		result.success = false;
		result.errorMessage = "Rename phase failed at file " + std::to_string(failedAt);
		return result;
	}

	LogEngine::Info(MOD, "Phase 1 complete.");

	// ── Step 4: Phase 2 — Copy source files to target ──
	LogEngine::Info(MOD, "Phase 2: Installing new files...");
	failedAt = -1;

	if (!CopyPhase(operations, failedAt)) {
		LogEngine::Error(MOD, "Phase 2 FAILED at file " + std::to_string(failedAt)
			+ ". Rolling back ALL changes.");
		RollbackRenames(operations);

		// Clean up manifest since we're fully rolled back
		try { fs::remove(manifestPath); } catch (...) {}

		result.success = false;
		result.errorMessage = "Copy phase failed at file " + std::to_string(failedAt);
		return result;
	}

	LogEngine::Info(MOD, "Phase 2 complete.");

	// ── Step 5: Cleanup — Delete .old files and manifest ──
	LogEngine::Info(MOD, "Cleaning up .old backup files...");
	CleanupOldFiles(operations);

	try { fs::remove(manifestPath); } catch (...) {}

	result.success = true;
	result.replacedFiles = result.totalFiles;
	LogEngine::Info(MOD, "SUCCESS: " + std::to_string(result.replacedFiles)
		+ " files replaced atomically.");

	return result;
}

// ── Crash Recovery from Stale Manifest ──

bool AtomicFileReplacer::RecoverFromManifest(const std::wstring& manifestPath) {
	LogEngine::Info(MOD, "=== CRASH RECOVERY MODE ===");
	LogEngine::Info(MOD, "Reading stale manifest...");

	auto operations = ReadManifest(manifestPath);
	if (operations.empty()) {
		LogEngine::Error(MOD, "Manifest is empty or unreadable. Cannot recover.");
		try { fs::remove(manifestPath); } catch (...) {}
		return false;
	}

	LogEngine::Info(MOD, "Manifest contains " + std::to_string(operations.size())
		+ " file operations. Analyzing state...");

	int committed = 0, rolledBack = 0, untouched = 0;

	for (const auto& op : operations) {
		bool oldExists = fs::exists(op.backupFile);   // .old marker
		bool newExists = fs::exists(op.targetFile);    // target file

		if (oldExists && newExists) {
			// Both exist: operation completed for this file. Commit forward (delete .old).
			try {
				fs::remove(op.backupFile);
				committed++;
				LogEngine::Info(MOD, "Recovery committed: "
					+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()));
			}
			catch (const std::exception& ex) {
				LogEngine::Error(MOD, "Recovery failed to commit "
					+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
					+ ": " + ex.what());
			}
		}
		else if (oldExists && !newExists) {
			// .old exists but target doesn't: crashed mid-copy. Rollback (rename .old back).
			try {
				fs::rename(op.backupFile, op.targetFile);
				rolledBack++;
				LogEngine::Info(MOD, "Recovery rolled back: "
					+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()));
			}
			catch (const std::exception& ex) {
				LogEngine::Error(MOD, "CRITICAL: Recovery failed to rollback "
					+ UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
					+ ": " + ex.what());
			}
		}
		else {
			// No .old: file was either never touched or fully committed in a previous run.
			untouched++;
		}
	}

	// Remove the manifest — recovery is complete
	try { fs::remove(manifestPath); } catch (...) {}

	LogEngine::Info(MOD, "Recovery complete: "
		+ std::to_string(committed) + " committed, "
		+ std::to_string(rolledBack) + " rolled back, "
		+ std::to_string(untouched) + " untouched.");

	return true;
}
