#include "pch.h"
#include "AtomicFileReplacer.h"
#include "UpdateConfig.h"

namespace fs = std::filesystem;
using namespace AutoUpdater;

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
			std::cout << "[AtomicReplacer] Excluded: " << UpdateConfig::WtoA(filename) << std::endl;
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
			std::cerr << "[AtomicReplacer] FATAL: Cannot write manifest file." << std::endl;
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

		std::cout << "[AtomicReplacer] Manifest written: " << operations.size() << " operations." << std::endl;
		return true;
	}
	catch (const std::exception& ex) {
		std::cerr << "[AtomicReplacer] Manifest write failed: " << ex.what() << std::endl;
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
		std::cerr << "[AtomicReplacer] Manifest read failed: " << ex.what() << std::endl;
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
			std::cerr << "[AtomicReplacer] Copy attempt " << attempt << "/" << maxRetries
				<< " failed for " << UpdateConfig::WtoA(fs::path(dst).filename().wstring())
				<< ": " << ex.what() << std::endl;

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
			std::cout << "[AtomicReplacer] New file (no rename needed): "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) << std::endl;
			continue;
		}

		try {
			// Remove stale .old from a previous attempt if it exists
			if (fs::exists(op.backupFile)) {
				fs::remove(op.backupFile);
			}

			fs::rename(op.targetFile, op.backupFile);
			op.renamed = true;

			std::cout << "[AtomicReplacer] Renamed: "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) << " -> .old" << std::endl;
		}
		catch (const std::exception& ex) {
			std::cerr << "[AtomicReplacer] RENAME FAILED for "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				<< ": " << ex.what() << std::endl;
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
			std::cout << "[AtomicReplacer] Installed: "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) << std::endl;
		}
		else {
			std::cerr << "[AtomicReplacer] COPY FAILED for "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				<< " after " << UpdateConfig::FILE_REPLACE_MAX_RETRIES << " retries." << std::endl;
			failedAt = i;
			return false;
		}
	}
	return true;
}

// ── Rollback: Restore .old files to original names ──

void AtomicFileReplacer::RollbackRenames(std::vector<FileOperation>& operations) {
	std::cout << "[AtomicReplacer] ROLLING BACK: Restoring original files..." << std::endl;
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
			std::cerr << "[AtomicReplacer] CRITICAL: Rollback failed for "
				<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
				<< ": " << ex.what() << std::endl;
		}
	}

	std::cout << "[AtomicReplacer] Rollback complete. Restored " << restored << " files." << std::endl;
}

// ── Cleanup: Delete .old files after success ──

void AtomicFileReplacer::CleanupOldFiles(const std::vector<FileOperation>& operations) {
	for (const auto& op : operations) {
		if (!op.renamed) continue;
		try {
			if (fs::exists(op.backupFile)) {
				fs::remove(op.backupFile);
			}
		}
		catch (...) {
			// Non-critical: .old file remains on disk. Log but don't fail.
			std::cerr << "[AtomicReplacer] Warning: Could not delete "
				<< UpdateConfig::WtoA(fs::path(op.backupFile).filename().wstring()) << std::endl;
		}
	}
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
	std::cout << "[AtomicReplacer] Building file operation list..." << std::endl;
	std::cout << "[AtomicReplacer]   Source: " << UpdateConfig::WtoA(sourceDir) << std::endl;
	std::cout << "[AtomicReplacer]   Target: " << UpdateConfig::WtoA(targetDir) << std::endl;

	auto operations = BuildOperationList(sourceDir, targetDir, exclusions);
	result.totalFiles = static_cast<int>(operations.size());

	if (operations.empty()) {
		result.success = false;
		result.errorMessage = "No files found in source directory";
		std::cerr << "[AtomicReplacer] ERROR: " << result.errorMessage << std::endl;
		return result;
	}

	std::cout << "[AtomicReplacer] " << result.totalFiles << " files to replace ("
		<< exclusions.size() << " excluded)." << std::endl;

	// ── Step 2: Write manifest (WAL checkpoint) ──
	if (!WriteManifest(manifestPath, operations)) {
		result.success = false;
		result.errorMessage = "Failed to write operation manifest";
		return result;
	}

	// ── Step 3: Phase 1 — Rename originals to .old ──
	std::cout << "[AtomicReplacer] Phase 1: Renaming target files to .old..." << std::endl;
	int failedAt = -1;

	if (!RenamePhase(operations, failedAt)) {
		std::cerr << "[AtomicReplacer] Phase 1 FAILED at file " << failedAt
			<< ". Rolling back all renames." << std::endl;
		RollbackRenames(operations);

		// Clean up manifest since we're fully rolled back
		try { fs::remove(manifestPath); } catch (...) {}

		result.success = false;
		result.errorMessage = "Rename phase failed at file " + std::to_string(failedAt);
		return result;
	}

	std::cout << "[AtomicReplacer] Phase 1 complete." << std::endl;

	// ── Step 4: Phase 2 — Copy source files to target ──
	std::cout << "[AtomicReplacer] Phase 2: Installing new files..." << std::endl;
	failedAt = -1;

	if (!CopyPhase(operations, failedAt)) {
		std::cerr << "[AtomicReplacer] Phase 2 FAILED at file " << failedAt
			<< ". Rolling back ALL changes." << std::endl;
		RollbackRenames(operations);

		// Clean up manifest since we're fully rolled back
		try { fs::remove(manifestPath); } catch (...) {}

		result.success = false;
		result.errorMessage = "Copy phase failed at file " + std::to_string(failedAt);
		return result;
	}

	std::cout << "[AtomicReplacer] Phase 2 complete." << std::endl;

	// ── Step 5: Cleanup — Delete .old files and manifest ──
	std::cout << "[AtomicReplacer] Cleaning up .old backup files..." << std::endl;
	CleanupOldFiles(operations);

	try { fs::remove(manifestPath); } catch (...) {}

	result.success = true;
	result.replacedFiles = result.totalFiles;
	std::cout << "[AtomicReplacer] SUCCESS: " << result.replacedFiles
		<< " files replaced atomically." << std::endl;

	return result;
}

// ── Crash Recovery from Stale Manifest ──

bool AtomicFileReplacer::RecoverFromManifest(const std::wstring& manifestPath) {
	std::cout << "[AtomicReplacer] === CRASH RECOVERY MODE ===" << std::endl;
	std::cout << "[AtomicReplacer] Reading stale manifest..." << std::endl;

	auto operations = ReadManifest(manifestPath);
	if (operations.empty()) {
		std::cerr << "[AtomicReplacer] Manifest is empty or unreadable. Cannot recover." << std::endl;
		try { fs::remove(manifestPath); } catch (...) {}
		return false;
	}

	std::cout << "[AtomicReplacer] Manifest contains " << operations.size()
		<< " file operations. Analyzing state..." << std::endl;

	int committed = 0, rolledBack = 0, untouched = 0;

	for (const auto& op : operations) {
		bool oldExists = fs::exists(op.backupFile);   // .old marker
		bool newExists = fs::exists(op.targetFile);    // target file

		if (oldExists && newExists) {
			// Both exist: operation completed for this file. Commit forward (delete .old).
			try {
				fs::remove(op.backupFile);
				committed++;
				std::cout << "[Recovery] Committed: "
					<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) << std::endl;
			}
			catch (const std::exception& ex) {
				std::cerr << "[Recovery] Failed to commit "
					<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
					<< ": " << ex.what() << std::endl;
			}
		}
		else if (oldExists && !newExists) {
			// .old exists but target doesn't: crashed mid-copy. Rollback (rename .old back).
			try {
				fs::rename(op.backupFile, op.targetFile);
				rolledBack++;
				std::cout << "[Recovery] Rolled back: "
					<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring()) << std::endl;
			}
			catch (const std::exception& ex) {
				std::cerr << "[Recovery] CRITICAL: Failed to rollback "
					<< UpdateConfig::WtoA(fs::path(op.targetFile).filename().wstring())
					<< ": " << ex.what() << std::endl;
			}
		}
		else {
			// No .old: file was either never touched or fully committed in a previous run.
			untouched++;
		}
	}

	// Remove the manifest — recovery is complete
	try { fs::remove(manifestPath); } catch (...) {}

	std::cout << "[AtomicReplacer] Recovery complete: "
		<< committed << " committed, "
		<< rolledBack << " rolled back, "
		<< untouched << " untouched." << std::endl;

	return true;
}
