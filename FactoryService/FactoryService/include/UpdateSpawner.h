#pragma once

#include <windows.h>
#include <string>

class UpdateSpawner {
public:
	static bool UpdateUpdaterExe(const std::wstring& baseDir);
	static bool SpawnAutoUpdater(const std::wstring& baseDir, HANDLE stopEvent, bool skipBackup, const std::wstring& updateType);
	static bool IsUpdaterRunning();

private:
	static std::wstring GetUpdaterPath(const std::wstring& baseDir);
	static std::wstring GetStagedUpdaterPath(const std::wstring& baseDir);
	static std::wstring GetBackupUpdaterPath(const std::wstring& baseDir);
};
