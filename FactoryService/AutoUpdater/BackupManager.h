#pragma once

#include <string>

class BackupManager {
public:
    
    static bool BackupCore();

    
    static bool BackupLAI();

    
    static bool RestoreCore();

    
    static bool RestoreLAI();

    
    static bool CleanupBackup();

private:
    static bool CopyDirectoryRecursive(const std::wstring& src, const std::wstring& dst);
    static bool EnsureDirectory(const std::wstring& path);
};
