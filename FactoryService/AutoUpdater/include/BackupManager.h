#pragma once

#include <string>

class BackupManager {
public:
    static bool BackupCore();
    static bool BackupLAI();

    static bool RestoreCoreToStaging();
    static bool RestoreLAIToStaging();

private:
    static bool EnsureDirectory(const std::wstring& path);
    static bool CopyFileChecked(const std::wstring& src, const std::wstring& dst, const char* label);
};
