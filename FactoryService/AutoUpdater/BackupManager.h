#pragma once

#include <string>

class BackupManager {
public:
    // Backup Core\ components (Agent + Service) to backup\Core\
    static bool BackupCore();

    // Backup LAI\ folder to backup\LAI\
    static bool BackupLAI();

    // Restore Core\ from backup
    static bool RestoreCore();

    // Restore LAI\ from backup
    static bool RestoreLAI();

    // Clean up backup folder after successful update
    static bool CleanupBackup();

private:
    static bool CopyDirectoryRecursive(const std::wstring& src, const std::wstring& dst);
    static bool EnsureDirectory(const std::wstring& path);
};
