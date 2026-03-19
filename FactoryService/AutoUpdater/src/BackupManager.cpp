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

bool BackupManager::BackupCore() {
    std::wstring backupCoreDir = UpdateConfig::g_Paths.BACKUP_DIR + UpdateConfig::CORE_SUBDIR;

    if (!EnsureDirectory(UpdateConfig::g_Paths.BACKUP_DIR) || !EnsureDirectory(backupCoreDir)) {
        return false;
    }

    std::wstring svcSrc = UpdateConfig::g_Paths.CORE_DIR + UpdateConfig::SERVICE_EXE;
    std::wstring svcDst = backupCoreDir + UpdateConfig::SERVICE_EXE;
    if (!CopyFileChecked(svcSrc, svcDst, "FactoryService.exe")) {
        return false;
    }

    std::wstring agentSrc = UpdateConfig::g_Paths.CORE_DIR + UpdateConfig::AGENT_EXE;
    std::wstring agentDst = backupCoreDir + UpdateConfig::AGENT_EXE;
    if (!CopyFileChecked(agentSrc, agentDst, "FactoryAgent.exe")) {
        return false;
    }

    return true;
}

bool BackupManager::BackupLAI() {
    std::wstring backupLAIDir = UpdateConfig::g_Paths.BACKUP_DIR + UpdateConfig::LAI_SUBDIR;

    if (!EnsureDirectory(backupLAIDir)) {
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

bool BackupManager::RestoreCoreToStaging() {
    std::wstring backupCoreDir = UpdateConfig::g_Paths.BACKUP_DIR + UpdateConfig::CORE_SUBDIR;
    std::wstring stagingCoreDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::CORE_SUBDIR;

    if (!fs::exists(backupCoreDir)) {
        std::cerr << "[BackupMgr] No Core backup found. Cannot restore." << std::endl;
        return false;
    }

    if (!EnsureDirectory(UpdateConfig::g_Paths.UPDATE_DIR) || !EnsureDirectory(stagingCoreDir)) {
        return false;
    }

    std::wstring svcSrc = backupCoreDir + UpdateConfig::SERVICE_EXE;
    std::wstring svcDst = stagingCoreDir + UpdateConfig::SERVICE_EXE;
    if (!CopyFileChecked(svcSrc, svcDst, "FactoryService.exe (restore)")) {
        return false;
    }

    std::wstring agentSrc = backupCoreDir + UpdateConfig::AGENT_EXE;
    std::wstring agentDst = stagingCoreDir + UpdateConfig::AGENT_EXE;
    if (!CopyFileChecked(agentSrc, agentDst, "FactoryAgent.exe (restore)")) {
        return false;
    }

    std::cout << "[BackupMgr] Core files restored to staging." << std::endl;
    return true;
}

bool BackupManager::RestoreLAIToStaging() {
    std::wstring backupLAIDir = UpdateConfig::g_Paths.BACKUP_DIR + UpdateConfig::LAI_SUBDIR;
    std::wstring stagingLAIDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::LAI_SUBDIR;

    if (!fs::exists(backupLAIDir)) {
        std::cout << "[BackupMgr] No LAI backup found. Skipping restore." << std::endl;
        return true;
    }

    if (!EnsureDirectory(stagingLAIDir)) {
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

