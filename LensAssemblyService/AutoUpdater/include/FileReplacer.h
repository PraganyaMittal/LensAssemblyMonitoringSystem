#pragma once

#include <string>
#include "UpdateConfig.h"

class FileReplacer {
public:
	static bool ReplaceBundle();
	static bool ReplaceLAI();

	static bool CleanupStaging();
	static bool CleanupBackup(UpdateConfig::UpdateType type);

private:
	static bool CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries);
	static bool CopyDirectoryContents(const std::wstring& src, const std::wstring& dst);
};
