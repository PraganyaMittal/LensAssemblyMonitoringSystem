#pragma once

#include <string>

class BackupManager {
public:
    // Backup FactoryAgent.exe, FactoryService.exe, and LAI directory
    // (AutoUpdater.exe is backed up by the Service before launch)
    static bool BackupCore();
    static bool BackupLAI();

    // Cleanup staging directory after successful update
    static bool CleanupStaging();

private:
    static bool EnsureDirectory(const std::wstring& path);
    static bool CopyFileChecked(const std::wstring& src, const std::wstring& dst, const char* label);
};
