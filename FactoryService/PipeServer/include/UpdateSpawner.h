#pragma once

#include <windows.h>
#include <string>

class UpdateSpawner {
public:
    static bool UpdateUpdaterExe();
    static bool SpawnAutoUpdater();
    static bool IsUpdaterRunning();

private:
    static std::wstring GetUpdaterPath();
    static std::wstring GetStagedUpdaterPath();
    static std::wstring GetBackupUpdaterPath();
};
