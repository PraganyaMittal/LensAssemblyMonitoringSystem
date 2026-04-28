#pragma once

#include <string>
#include <windows.h>

#pragma comment(lib, "Version.lib")

/// Reads the "FileVersion" string from a PE exe's embedded VS_VERSION_INFO resource.
/// This is the industry-standard way to read version info on Windows.
/// No external text files needed — the version is baked into the exe at compile time.
class VersionHelper {
public:
    /// Get version from a specific exe path.
    /// Returns "major.minor.patch" or empty string if not found.
    static std::string GetFileVersion(const std::string& exePath) {
        DWORD handle = 0;
        DWORD size = GetFileVersionInfoSizeA(exePath.c_str(), &handle);
        if (size == 0) return "";

        std::vector<char> buffer(size);
        if (!GetFileVersionInfoA(exePath.c_str(), handle, size, buffer.data()))
            return "";

        // Try the string version first (e.g. "2.0.0.0")
        struct LangCodePage {
            WORD language;
            WORD codePage;
        } *translations = nullptr;
        UINT translationSize = 0;

        if (VerQueryValueA(buffer.data(), "\\VarFileInfo\\Translation",
            (LPVOID*)&translations, &translationSize)) {

            if (translationSize >= sizeof(LangCodePage)) {
                char subBlock[256];
                sprintf_s(subBlock, "\\StringFileInfo\\%04x%04x\\FileVersion",
                    translations[0].language, translations[0].codePage);

                char* versionStr = nullptr;
                UINT versionLen = 0;
                if (VerQueryValueA(buffer.data(), subBlock, (LPVOID*)&versionStr, &versionLen)) {
                    if (versionStr && versionLen > 0) {
                        std::string version(versionStr);
                        // Strip trailing ".0" to get "2.0.0" from "2.0.0.0"
                        if (version.size() >= 2 && version.substr(version.size() - 2) == ".0") {
                            version = version.substr(0, version.size() - 2);
                        }
                        return version;
                    }
                }
            }
        }

        // Fallback: use the fixed version info (numeric)
        VS_FIXEDFILEINFO* fixedInfo = nullptr;
        UINT fixedLen = 0;
        if (VerQueryValueA(buffer.data(), "\\", (LPVOID*)&fixedInfo, &fixedLen)) {
            if (fixedInfo) {
                int major = HIWORD(fixedInfo->dwFileVersionMS);
                int minor = LOWORD(fixedInfo->dwFileVersionMS);
                int patch = HIWORD(fixedInfo->dwFileVersionLS);
                return std::to_string(major) + "." + std::to_string(minor) + "." + std::to_string(patch);
            }
        }

        return "";
    }

    /// Get version of the currently running exe.
    static std::string GetOwnVersion() {
        char path[MAX_PATH];
        GetModuleFileNameA(NULL, path, MAX_PATH);
        return GetFileVersion(path);
    }

    /// Get version of an exe in the same directory as the current exe.
    static std::string GetSiblingVersion(const std::string& exeFileName) {
        char path[MAX_PATH];
        GetModuleFileNameA(NULL, path, MAX_PATH);
        std::string dir(path);
        size_t pos = dir.find_last_of("\\/");
        if (pos != std::string::npos) {
            dir = dir.substr(0, pos + 1);
        }
        return GetFileVersion(dir + exeFileName);
    }
};
