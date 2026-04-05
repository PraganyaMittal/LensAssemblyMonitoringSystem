#include "pch.h"
#include "BackupManager.h"
#include "UpdateConfig.h"

namespace fs = std::filesystem;

bool BackupManager::EnsureDirectory(const std::wstring& path) {
	try {
		if (!fs::exists(path)) {
			fs::create_directories(path);
		}
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[BackupMgr] Failed to create directory: " << ex.what() << std::endl;
		return false;
	}
}

bool BackupManager::CopyFileChecked(const std::wstring& src, const std::wstring& dst, const char* label) {
	if (!fs::exists(src)) {
		std::cout << "[BackupMgr] " << label << " not found at source. Skipping backup." << std::endl;
		return true;
	}

	try {
		fs::copy_file(src, dst, fs::copy_options::overwrite_existing);
		std::cout << "[BackupMgr] Backed up " << label << std::endl;
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[BackupMgr] Failed to backup " << label << ": " << ex.what() << std::endl;
		return false;
	}
}

static std::wstring GetTypeBackupDir(UpdateConfig::UpdateType type) {
	return (type == UpdateConfig::UpdateType::BUNDLE) 
		? UpdateConfig::g_Paths.BACKUP_BUNDLE_DIR 
		: UpdateConfig::g_Paths.BACKUP_LAI_DIR;
}

bool BackupManager::BackupBundle(UpdateConfig::UpdateType type) {
	if (type != UpdateConfig::UpdateType::BUNDLE) return true;

	std::wstring backupBundleDir = UpdateConfig::g_Paths.BACKUP_BUNDLE_DIR;

	if (!EnsureDirectory(UpdateConfig::g_Paths.BACKUP_DIR) || !EnsureDirectory(backupBundleDir)) {
		return false;
	}

	std::wstring svcSrc = UpdateConfig::g_Paths.BUNDLE_DIR + UpdateConfig::g_Runtime.serviceName.c_str();
	std::wstring svcDst = backupBundleDir + UpdateConfig::g_Runtime.serviceName.c_str();
	if (!CopyFileChecked(svcSrc, svcDst, "LensAssemblyService.exe")) {
		return false;
	}

	std::wstring agentSrc = UpdateConfig::g_Paths.BUNDLE_DIR + UpdateConfig::g_Runtime.agentExe.c_str();
	std::wstring agentDst = backupBundleDir + UpdateConfig::g_Runtime.agentExe.c_str();
	if (!CopyFileChecked(agentSrc, agentDst, "LensAssemblyAgent.exe")) {
		return false;
	}

	return true;
}

bool BackupManager::BackupLAI(UpdateConfig::UpdateType type) {
	std::wstring backupLAIDir = UpdateConfig::g_Paths.BACKUP_LAI_DIR;

	if (!EnsureDirectory(UpdateConfig::g_Paths.BACKUP_DIR) || !EnsureDirectory(backupLAIDir)) {
		return false;
	}

	std::wstring laiSrc = UpdateConfig::g_Paths.LAI_DIR;
	if (!fs::exists(laiSrc)) {
		std::cout << "[BackupMgr] LAI directory not found. Skipping backup." << std::endl;
		return true;
	}

	std::cout << "[BackupMgr] Backing up LAI directory..." << std::endl;

	try {
		for (const auto& entry : fs::recursive_directory_iterator(laiSrc)) {
			fs::path relativePath = fs::relative(entry.path(), laiSrc);
			fs::path targetPath = fs::path(backupLAIDir) / relativePath;

			if (entry.is_directory()) {
				fs::create_directories(targetPath);
			} else if (entry.is_regular_file()) {
				fs::create_directories(targetPath.parent_path());
				fs::copy_file(entry.path(), targetPath, fs::copy_options::overwrite_existing);
			}
		}
		std::cout << "[BackupMgr] LAI backup complete." << std::endl;
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[BackupMgr] LAI backup failed: " << ex.what() << std::endl;
		return false;
	}
}

bool BackupManager::RestoreBundleToStaging(UpdateConfig::UpdateType type) {
	if (type != UpdateConfig::UpdateType::BUNDLE) return true;

	std::wstring backupBundleDir = UpdateConfig::g_Paths.BACKUP_BUNDLE_DIR;
	std::wstring stagingBundleDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::BUNDLE_SUBDIR;

	if (!fs::exists(backupBundleDir)) {
		std::cerr << "[BackupMgr] No Bundle backup found. Cannot restore." << std::endl;
		return false;
	}

	bool hasFiles = false;
	for (const auto& entry : fs::directory_iterator(backupBundleDir)) {
		if (entry.is_regular_file()) { hasFiles = true; break; }
	}
	if (!hasFiles) {
		std::cerr << "[BackupMgr] Bundle backup directory exists but is EMPTY. Cannot restore." << std::endl;
		return false;
	}

	if (!EnsureDirectory(UpdateConfig::g_Paths.UPDATE_DIR) || !EnsureDirectory(stagingBundleDir)) {
		return false;
	}

	bool ok = true;
	try {
		for (const auto& entry : fs::directory_iterator(backupBundleDir)) {
			if (entry.is_regular_file()) {
				std::wstring filename = entry.path().filename().wstring();
				std::wstring dstFile = stagingBundleDir + filename;

				if (!CopyFileChecked(entry.path().wstring(), dstFile, UpdateConfig::WtoA(filename).c_str())) {
					ok = false;
				}
			}
		}
	} catch (const std::exception& ex) {
		std::cerr << "[BackupMgr] FAILED iterating Bundle backup directory: " << ex.what() << std::endl;
		ok = false;
	}
	return ok;
}


bool BackupManager::RestoreLAIToStaging(UpdateConfig::UpdateType type) {
	std::wstring backupLAIDir = UpdateConfig::g_Paths.BACKUP_LAI_DIR;
	std::wstring stagingLAIDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::LAI_SUBDIR;

	if (!fs::exists(backupLAIDir)) {
		std::cerr << "[BackupMgr] No LAI backup found. Cannot restore." << std::endl;
		return false;
	}

	bool hasFiles = false;
	for (const auto& entry : fs::recursive_directory_iterator(backupLAIDir)) {
		if (entry.is_regular_file()) { hasFiles = true; break; }
	}
	if (!hasFiles) {
		std::cerr << "[BackupMgr] LAI backup directory exists but is EMPTY. Cannot restore." << std::endl;
		return false;
	}

	if (!EnsureDirectory(UpdateConfig::g_Paths.UPDATE_DIR) || !EnsureDirectory(stagingLAIDir)) {
		return false;
	}

	try {
		for (const auto& entry : fs::recursive_directory_iterator(backupLAIDir)) {
			fs::path relativePath = fs::relative(entry.path(), backupLAIDir);
			fs::path targetPath = fs::path(stagingLAIDir) / relativePath;

			if (entry.is_directory()) {
				fs::create_directories(targetPath);
			} else if (entry.is_regular_file()) {
				fs::create_directories(targetPath.parent_path());
				fs::copy_file(entry.path(), targetPath, fs::copy_options::overwrite_existing);
			}
		}
		std::cout << "[BackupMgr] LAI files restored to staging." << std::endl;
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[BackupMgr] LAI restore to staging failed: " << ex.what() << std::endl;
		return false;
	}
}


