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

bool BackupManager::CopyDirectoryRecursive(const std::wstring& src, const std::wstring& dst) {
    try {
        if (!fs::exists(src)) {
            std::cout << "[BackupMgr] Source does not exist, skipping: ";
            std::wcout << src << std::endl;
            return true;  // Not an error — directory may not exist yet
        }

        EnsureDirectory(dst);
        fs::copy(src, dst, fs::copy_options::recursive | fs::copy_options::overwrite_existing);
        return true;
    } catch (const std::exception& ex) {
        std::cerr << "[BackupMgr] Copy failed: " << ex.what() << std::endl;
        return false;
    }
}

bool BackupManager::BackupCore() {
    std::wstring src = UpdateConfig::CORE_DIR;
    std::wstring dst = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::CORE_SUBDIR;

    std::cout << "[BackupMgr] Backing up Core..." << std::endl;

    EnsureDirectory(UpdateConfig::BACKUP_DIR);

    // We only backup Agent and Service exes (not AutoUpdater — already handled by Service)
    EnsureDirectory(dst);

    bool ok = true;
    std::wstring agentSrc = src + UpdateConfig::AGENT_EXE;
    std::wstring agentDst = dst + UpdateConfig::AGENT_EXE;
    if (fs::exists(agentSrc)) {
        try {
            fs::copy_file(agentSrc, agentDst, fs::copy_options::overwrite_existing);
            std::cout << "[BackupMgr] Backed up FactoryAgent.exe" << std::endl;
        } catch (const std::exception& ex) {
            std::cerr << "[BackupMgr] Failed to backup FactoryAgent.exe: " << ex.what() << std::endl;
            ok = false;
        }
    }

    std::wstring svcSrc = src + UpdateConfig::SERVICE_EXE;
    std::wstring svcDst = dst + UpdateConfig::SERVICE_EXE;
    if (fs::exists(svcSrc)) {
        try {
            fs::copy_file(svcSrc, svcDst, fs::copy_options::overwrite_existing);
            std::cout << "[BackupMgr] Backed up FactoryService.exe" << std::endl;
        } catch (const std::exception& ex) {
            std::cerr << "[BackupMgr] Failed to backup FactoryService.exe: " << ex.what() << std::endl;
            ok = false;
        }
    }

    return ok;
}

bool BackupManager::BackupLAI() {
    std::wstring src = UpdateConfig::LAI_DIR;
    std::wstring dst = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::LAI_SUBDIR;

    if (!fs::exists(src)) {
        std::cout << "[BackupMgr] LAI directory not found. Skipping backup." << std::endl;
        return true;
    }

    std::cout << "[BackupMgr] Backing up LAI..." << std::endl;
    return CopyDirectoryRecursive(src, dst);
}

bool BackupManager::RestoreCore() {
    std::wstring backup = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::CORE_SUBDIR;
    std::wstring target = UpdateConfig::CORE_DIR;

    if (!fs::exists(backup)) {
        std::cerr << "[BackupMgr] No Core backup found for restore!" << std::endl;
        return false;
    }

    std::cout << "[BackupMgr] Restoring Core from backup..." << std::endl;

    // Restore Agent and Service exes
    bool ok = true;
    std::wstring agentBackup = backup + UpdateConfig::AGENT_EXE;
    std::wstring agentTarget = target + UpdateConfig::AGENT_EXE;
    if (fs::exists(agentBackup)) {
        try {
            fs::copy_file(agentBackup, agentTarget, fs::copy_options::overwrite_existing);
            std::cout << "[BackupMgr] Restored FactoryAgent.exe" << std::endl;
        } catch (const std::exception& ex) {
            std::cerr << "[BackupMgr] Failed to restore FactoryAgent.exe: " << ex.what() << std::endl;
            ok = false;
        }
    }

    std::wstring svcBackup = backup + UpdateConfig::SERVICE_EXE;
    std::wstring svcTarget = target + UpdateConfig::SERVICE_EXE;
    if (fs::exists(svcBackup)) {
        try {
            fs::copy_file(svcBackup, svcTarget, fs::copy_options::overwrite_existing);
            std::cout << "[BackupMgr] Restored FactoryService.exe" << std::endl;
        } catch (const std::exception& ex) {
            std::cerr << "[BackupMgr] Failed to restore FactoryService.exe: " << ex.what() << std::endl;
            ok = false;
        }
    }

    return ok;
}

bool BackupManager::RestoreLAI() {
    std::wstring backup = std::wstring(UpdateConfig::BACKUP_DIR) + UpdateConfig::LAI_SUBDIR;
    std::wstring target = UpdateConfig::LAI_DIR;

    if (!fs::exists(backup)) {
        std::cout << "[BackupMgr] No LAI backup found. Skipping restore." << std::endl;
        return true;
    }

    std::cout << "[BackupMgr] Restoring LAI from backup..." << std::endl;

    try {
        // Clear target and copy from backup
        if (fs::exists(target)) {
            fs::remove_all(target);
        }
        return CopyDirectoryRecursive(backup, target);
    } catch (const std::exception& ex) {
        std::cerr << "[BackupMgr] LAI restore failed: " << ex.what() << std::endl;
        return false;
    }
}

bool BackupManager::CleanupBackup() {
    try {
        if (fs::exists(UpdateConfig::BACKUP_DIR)) {
            fs::remove_all(UpdateConfig::BACKUP_DIR);
            std::cout << "[BackupMgr] Backup directory cleaned up." << std::endl;
        }
        if (fs::exists(UpdateConfig::UPDATE_DIR)) {
            fs::remove_all(UpdateConfig::UPDATE_DIR);
            std::cout << "[BackupMgr] Update staging directory cleaned up." << std::endl;
        }
        return true;
    } catch (const std::exception& ex) {
        std::cerr << "[BackupMgr] Cleanup failed: " << ex.what() << std::endl;
        return false;
    }
}
