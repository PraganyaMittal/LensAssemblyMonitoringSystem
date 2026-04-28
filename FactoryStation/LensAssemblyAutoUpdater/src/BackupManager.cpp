#include "pch.h"
#include "BackupManager.h"
#include "UpdateConfig.h"
#include "UpdaterModules.h"
#include <LogEngine.h>

namespace fs = std::filesystem;
using namespace AutoUpdater;

static constexpr const char* MOD = "BackupManager";

// ── Ensure Directory Exists ──

bool BackupManager::EnsureDirectory(const std::wstring& path) {
	try {
		if (!fs::exists(path)) {
			fs::create_directories(path);
		}
		return true;
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, "Failed to create directory "
			+ UpdateConfig::WtoA(path) + ": " + ex.what());
		return false;
	}
}

// ── Full Directory Backup ──

bool BackupManager::BackupDirectory(const std::wstring& sourceDir, const std::wstring& backupDir) {
	try {
		// Validate source exists
		if (!fs::exists(sourceDir)) {
			LogEngine::Error(MOD, "Source directory does not exist: "
				+ UpdateConfig::WtoA(sourceDir));
			return false;
		}

		// If backup already exists, remove it first (overwrite previous backup)
		if (fs::exists(backupDir)) {
			LogEngine::Info(MOD, "Removing existing backup...");
			fs::remove_all(backupDir);
		}

		// Ensure parent backup directory exists
		fs::path parentDir = fs::path(backupDir).parent_path();
		if (!EnsureDirectory(parentDir.wstring())) {
			return false;
		}

		// Copy entire directory recursively
		LogEngine::Info(MOD, "Copying " + UpdateConfig::WtoA(sourceDir)
			+ " -> " + UpdateConfig::WtoA(backupDir));

		fs::copy(sourceDir, backupDir,
			fs::copy_options::recursive | fs::copy_options::overwrite_existing);

		// Count files for verification
		int fileCount = 0;
		for (const auto& entry : fs::recursive_directory_iterator(backupDir)) {
			if (entry.is_regular_file()) fileCount++;
		}

		LogEngine::Info(MOD, "Backup complete: " + std::to_string(fileCount) + " files.");
		return true;
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, std::string("Backup FAILED: ") + ex.what());
		return false;
	}
}

// ── Backup Manifest Generation ──

bool BackupManager::WriteBackupManifest(const std::wstring& backupDir, const std::string& typeName) {
	try {
		if (!fs::exists(backupDir)) {
			LogEngine::Error(MOD, "Cannot write manifest — backup dir doesn't exist.");
			return false;
		}

		// Collect file inventory
		std::vector<std::string> fileNames;
		uintmax_t totalSize = 0;

		for (const auto& entry : fs::recursive_directory_iterator(backupDir)) {
			if (entry.is_regular_file()) {
				fs::path relativePath = fs::relative(entry.path(), backupDir);
				// Skip the manifest file itself if it exists from a previous run
				if (relativePath.filename() == "backup_manifest.json") continue;

				fileNames.push_back(relativePath.string());
				totalSize += entry.file_size();
			}
		}

		// Get current timestamp
		auto now = std::chrono::system_clock::now();
		auto time = std::chrono::system_clock::to_time_t(now);
		struct tm buf;
		localtime_s(&buf, &time);
		char ts[64];
		strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%S", &buf);

		// Write JSON manifest (manual construction — no JSON library in AutoUpdater)
		std::wstring manifestPath = backupDir + L"backup_manifest.json";
		std::ofstream manifest(manifestPath, std::ios::trunc);
		if (!manifest.is_open()) {
			LogEngine::Error(MOD, "Cannot open manifest file for writing.");
			return false;
		}

		manifest << "{\n";
		manifest << "  \"createdAt\": \"" << ts << "\",\n";
		manifest << "  \"type\": \"" << typeName << "\",\n";
		manifest << "  \"fileCount\": " << fileNames.size() << ",\n";
		manifest << "  \"totalSizeBytes\": " << totalSize << ",\n";
		manifest << "  \"files\": [\n";

		for (size_t i = 0; i < fileNames.size(); i++) {
			// Escape backslashes in file paths for JSON
			std::string escaped;
			for (char c : fileNames[i]) {
				if (c == '\\') escaped += "\\\\";
				else escaped += c;
			}
			manifest << "    \"" << escaped << "\"";
			if (i < fileNames.size() - 1) manifest << ",";
			manifest << "\n";
		}

		manifest << "  ]\n";
		manifest << "}\n";
		manifest.close();

		LogEngine::Info(MOD, "Manifest written: " + std::to_string(fileNames.size())
			+ " files, " + std::to_string(totalSize / 1024) + " KB total.");
		return true;
	}
	catch (const std::exception& ex) {
		LogEngine::Error(MOD, std::string("Manifest write failed: ") + ex.what());
		return false;
	}
}
