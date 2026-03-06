#pragma once

#include <windows.h>
#include <string>

class UpdateSpawner {
public:
    // Replace AutoUpdater.exe from staging BEFORE spawning.
    // Safe because the updater process isn't running at this point.
    static bool UpdateUpdaterExe();

    // Spawn the (now up-to-date) AutoUpdater.exe with update payload.
    static bool SpawnAutoUpdater(const std::string& updatePayload);

    // Check if an AutoUpdater process is already running.
    static bool IsUpdaterRunning();

private:
    static std::wstring GetUpdaterPath();
    static std::wstring GetStagedUpdaterPath();
    static std::wstring GetBackupUpdaterPath();
};
