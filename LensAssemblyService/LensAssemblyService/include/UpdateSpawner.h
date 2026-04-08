#pragma once

#include <windows.h>
#include <string>

struct ServiceConfig;
struct DeployRequest;

class UpdateSpawner {
public:
	// Spawn AutoUpdater with all paths/exe names passed as cmd line args
	static bool SpawnAutoUpdater(const ServiceConfig& config, const DeployRequest& req,
	                             HANDLE stopEvent);

	// Update AutoUpdater.exe from staging before spawning
	static bool UpdateUpdaterExe(const ServiceConfig& config, const std::wstring& baseDir, bool isRollback);

	// Check if AutoUpdater is currently running
	static bool IsUpdaterRunning(const std::wstring& updaterExeName);

private:
	static std::wstring GetUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe);
	static std::wstring GetStagedUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe);
	static std::wstring GetBackupUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe);
};
