#include "BackupManager.h"
#include "UpdateConfig.h"
#include <iostream>
#include <filesystem>

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
        return true;  // Not an error — file simply doesn't exist yet
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

bool BackupManager::BackupCore() {
    std::wstring backupCoreDir = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::CORE_SUBDIR;

    if (!EnsureDirectory(UpdateConfig::BACKUP_DIR) || !EnsureDirectory(backupCoreDir)) {
        return false;
    }

    // Backup FactoryService.exe
    std::wstring svcSrc = std::wstring(UpdateConfig::CORE_DIR) + UpdateConfig::SERVICE_EXE;
    std::wstring svcDst = backupCoreDir + UpdateConfig::SERVICE_EXE;
    if (!CopyFileChecked(svcSrc, svcDst, "FactoryService.exe")) {
        return false;
    }

    // Backup FactoryAgent.exe
    std::wstring agentSrc = std::wstring(UpdateConfig::CORE_DIR) + UpdateConfig::AGENT_EXE;
    std::wstring agentDst = backupCoreDir + UpdateConfig::AGENT_EXE;
    if (!CopyFileChecked(agentSrc, agentDst, "FactoryAgent.exe")) {
        return false;
    }

    return true;
}

bool BackupManager::BackupLAI() {
    std::wstring backupLAIDir = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::LAI_SUBDIR;

    if (!EnsureDirectory(backupLAIDir)) {
        return false;
    }

    std::wstring laiSrc = UpdateConfig::LAI_DIR;
    if (!fs::exists(laiSrc)) {
        std::cout << "[BackupMgr] LAI directory not found. Skipping backup." << std::endl;
        return true;
    }

    std::cout << "[BackupMgr] Backing up LAI directory..." << std::endl;

    try {
        // Copy each file individually to avoid nested-directory bugs with fs::copy
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

bool BackupManager::CleanupStaging() {
    try {
        if (fs::exists(UpdateConfig::UPDATE_DIR)) {
            fs::remove_all(UpdateConfig::UPDATE_DIR);
            std::cout << "[BackupMgr] Update staging directory cleaned up." << std::endl;
        }
        // NOTE: backup directory is intentionally NOT cleaned up.
        // It must persist so rollback can restore the previous version.
        return true;
    } catch (const std::exception& ex) {
        std::cerr << "[BackupMgr] Staging cleanup failed: " << ex.what() << std::endl;
        return false;
    }
}
