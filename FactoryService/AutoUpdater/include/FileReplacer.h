#pragma once

#include <string>

class FileReplacer {
public:
	static bool ReplaceBundle();
	static bool ReplaceLAI();

	static bool CleanupStaging();

private:
	static bool CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries);
	static bool CopyDirectoryContents(const std::wstring& src, const std::wstring& dst);
};
