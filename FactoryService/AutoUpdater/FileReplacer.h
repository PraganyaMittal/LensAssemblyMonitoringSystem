#pragma once

#include <string>

class FileReplacer {
public:
    // Replace Core\ files (Agent + Service) from update\Core
    static bool ReplaceCore();

    // Replace LAI\ from update\LAI
    static bool ReplaceLAI();

private:
    static bool CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries);
    static bool CopyDirectoryContents(const std::wstring& src, const std::wstring& dst);
};
