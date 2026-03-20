#include "pch.h"
#include "UpdateSpawner.h"
#include "PipeProtocol.h"
#include "ServiceLogger.h"

namespace fs = std::filesystem;

std::wstring UpdateSpawner::GetUpdaterPath(const std::wstring& baseDir) {
    return baseDir + L"Bundle\\" + PipeProtocol::UPDATER_EXE_NAME;
}

std::wstring UpdateSpawner::GetStagedUpdaterPath(const std::wstring& baseDir) {
    return baseDir + L"update\\Bundle\\" + PipeProtocol::UPDATER_EXE_NAME;
}

std::wstring UpdateSpawner::GetBackupUpdaterPath(const std::wstring& baseDir) {
    return baseDir + L"backup\\Bundle\\" + PipeProtocol::UPDATER_EXE_NAME;
}

bool UpdateSpawner::UpdateUpdaterExe(const std::wstring& baseDir) {
    std::wstring currentUpdater = GetUpdaterPath(baseDir);
    std::wstring stagedUpdater = GetStagedUpdaterPath(baseDir);
    std::wstring backupUpdater = GetBackupUpdaterPath(baseDir);

    std::wstring backupDir = baseDir + L"backup\\";
    std::wstring backupBundleDir = backupDir + L"Bundle\\";
    CreateDirectoryW(backupDir.c_str(), NULL);
    CreateDirectoryW(backupBundleDir.c_str(), NULL);

    if (GetFileAttributesW(currentUpdater.c_str()) != INVALID_FILE_ATTRIBUTES) {
        DeleteFileW(backupUpdater.c_str());
        if (CopyFileW(currentUpdater.c_str(), backupUpdater.c_str(), FALSE)) {
            PIPE_LOG_INFO("[UpdateSpawner] Backed up AutoUpdater.exe");
        } else {
            PIPE_LOG_ERROR("[UpdateSpawner] Failed to backup AutoUpdater.exe. Error: " << GetLastError());
            return false;
        }
    }

    if (GetFileAttributesW(stagedUpdater.c_str()) == INVALID_FILE_ATTRIBUTES) {
        PIPE_LOG_INFO("[UpdateSpawner] No new AutoUpdater in staging. Using existing.");
        return true;
    }

    PIPE_LOG_INFO("[UpdateSpawner] New AutoUpdater found in staging: " << PipeProtocol::WtoNarrow(stagedUpdater));

    if (!CopyFileW(stagedUpdater.c_str(), currentUpdater.c_str(), FALSE)) {
        PIPE_LOG_ERROR("[UpdateSpawner] Failed to install new AutoUpdater. Error: " << GetLastError());
        CopyFileW(backupUpdater.c_str(), currentUpdater.c_str(), FALSE);
        return false;
    }

    PIPE_LOG_INFO("[UpdateSpawner] New AutoUpdater.exe installed.");
    DeleteFileW(stagedUpdater.c_str());
    return true;
}

bool UpdateSpawner::SpawnAutoUpdater(const std::wstring& baseDir, HANDLE stopEvent, bool skipBackup, const std::wstring& updateType) {
    if (IsUpdaterRunning()) {
        PIPE_LOG_ERROR("[UpdateSpawner] AutoUpdater already running. Skipping spawn.");
        return false;
    }

    std::wstring updaterPath = GetUpdaterPath(baseDir);

    if (GetFileAttributesW(updaterPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        PIPE_LOG_ERROR("[UpdateSpawner] AutoUpdater.exe not found at: " << PipeProtocol::WtoNarrow(updaterPath));
        return false;
    }

    // Strip all trailing backslashes to avoid command line quote-escaping issues
    std::wstring safeBaseDir = baseDir;
    while (!safeBaseDir.empty() && safeBaseDir.back() == L'\\') {
        safeBaseDir.pop_back();
    }
    std::wstring cmdLine = L"\"" + updaterPath + L"\" --base-dir \"" + safeBaseDir + L"\"";
    if (skipBackup) {
        cmdLine += L" --skip-backup";
    }
    if (!updateType.empty()) {
        cmdLine += L" --type " + updateType;
    }

    std::vector<wchar_t> cmdLineBuf(cmdLine.begin(), cmdLine.end());
    cmdLineBuf.push_back(L'\0');

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    std::wstring bundleDir = baseDir + L"Bundle\\";
    BOOL ok = CreateProcessW(
        updaterPath.c_str(),
        cmdLineBuf.data(),
        NULL, NULL, FALSE,
        CREATE_NO_WINDOW,
        NULL,
        bundleDir.c_str(),
        &si,
        &pi
    );

    if (!ok) {
        PIPE_LOG_ERROR("[UpdateSpawner] CreateProcess failed. Error: " << GetLastError());
        return false;
    }

    PIPE_LOG_INFO("[UpdateSpawner] AutoUpdater spawned. PID: " << pi.dwProcessId);
    PIPE_LOG_INFO("[UpdateSpawner] Fire and forget: AutoUpdater handles shutdown.");

    if (stopEvent) {
        SetEvent(stopEvent);
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    PIPE_LOG_INFO("[UpdateSpawner] Service spawn completed.");
    return true;
}

bool UpdateSpawner::IsUpdaterRunning() {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return false;

    PROCESSENTRY32W pe = {};
    pe.dwSize = sizeof(pe);
    bool found = false;

    if (Process32FirstW(snapshot, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, PipeProtocol::UPDATER_EXE_NAME) == 0) {
                found = true;
                break;
            }
        } while (Process32NextW(snapshot, &pe));
    }
    CloseHandle(snapshot);
    return found;
}
