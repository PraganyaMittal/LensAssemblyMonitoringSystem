#pragma once

#include <string>
#include "UpdateConfig.h"

class BackupManager {
public:
	static bool BackupBundle(UpdateConfig::UpdateType type);
	static bool BackupLAI(UpdateConfig::UpdateType type);

	static bool RestoreBundleToStaging(UpdateConfig::UpdateType type);
	static bool RestoreLAIToStaging(UpdateConfig::UpdateType type);

private:
	static bool EnsureDirectory(const std::wstring& path);
	static bool CopyFileChecked(const std::wstring& src, const std::wstring& dst, const char* label);
};
