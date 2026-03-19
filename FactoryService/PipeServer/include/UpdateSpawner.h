#pragma once

#include <windows.h>
#include <string>

class UpdateSpawner {
public:
    static bool UpdateUpdaterExe(const std::wstring& baseDir);
    static bool SpawnAutoUpdater(const std::wstring& baseDir, HANDLE stopEvent, bool skipBackup = false);
    static bool IsUpdaterRunning();

private:
    static std::wstring GetCoreDir(const std::wstring& baseDir);
    static std::wstring GetUpdaterPath(const std::wstring& baseDir);
    static std::wstring GetStagedUpdaterPath(const std::wstring& baseDir);
    static std::wstring GetBackupUpdaterPath(const std::wstring& baseDir);
};
