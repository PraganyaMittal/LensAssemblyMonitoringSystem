#include "UpdateSpawner.h"
#include "../../Common/PipeProtocol.h"
#include <tlhelp32.h>
#include <iostream>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;

std::wstring UpdateSpawner::GetUpdaterPath() {
    return std::wstring(PipeProtocol::CORE_DIR) + PipeProtocol::UPDATER_EXE_NAME;
}

std::wstring UpdateSpawner::GetStagedUpdaterPath() {
    return std::wstring(PipeProtocol::UPDATE_DIR) + L"Core\\" + PipeProtocol::UPDATER_EXE_NAME;
}

std::wstring UpdateSpawner::GetBackupUpdaterPath() {
    return std::wstring(PipeProtocol::BACKUP_DIR) + L"Core\\" + PipeProtocol::UPDATER_EXE_NAME;
}

bool UpdateSpawner::UpdateUpdaterExe() {
    std::wstring currentUpdater = GetUpdaterPath();
    std::wstring stagedUpdater = GetStagedUpdaterPath();
    std::wstring backupUpdater = GetBackupUpdaterPath();

    // ── Step 1: Create backup directory ──
    std::wstring backupCoreDir = std::wstring(PipeProtocol::BACKUP_DIR) + L"Core\\";
    CreateDirectoryW(PipeProtocol::BACKUP_DIR, NULL);
    CreateDirectoryW(backupCoreDir.c_str(), NULL);

    // ── Step 2: Backup AutoUpdater.exe (only — Agent/Service/LAI are backed up by AutoUpdater) ──
    if (GetFileAttributesW(currentUpdater.c_str()) != INVALID_FILE_ATTRIBUTES) {
        DeleteFileW(backupUpdater.c_str());
        if (CopyFileW(currentUpdater.c_str(), backupUpdater.c_str(), FALSE)) {
            std::cout << "[UpdateSpawner] Backed up AutoUpdater.exe" << std::endl;
        } else {
            std::cerr << "[UpdateSpawner] Failed to backup AutoUpdater.exe. Error: " << GetLastError() << std::endl;
            return false;
        }
    }

    // ── Step 4: Replace AutoUpdater.exe if new version is staged ──
    if (GetFileAttributesW(stagedUpdater.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cout << "[UpdateSpawner] No new AutoUpdater in staging. Using existing." << std::endl;
        return true;
    }

    std::wcout << L"[UpdateSpawner] New AutoUpdater found in staging: " << stagedUpdater << std::endl;

    // AutoUpdater is NOT running yet, so we can directly overwrite it
    if (!CopyFileW(stagedUpdater.c_str(), currentUpdater.c_str(), FALSE)) {
        std::cerr << "[UpdateSpawner] Failed to install new AutoUpdater. Error: " << GetLastError() << std::endl;
        // Restore from backup
        CopyFileW(backupUpdater.c_str(), currentUpdater.c_str(), FALSE);
        return false;
    }

    std::cout << "[UpdateSpawner] New AutoUpdater.exe installed." << std::endl;
    DeleteFileW(stagedUpdater.c_str());
    return true;
}

bool UpdateSpawner::SpawnAutoUpdater(const std::string& updatePayload) {
    if (IsUpdaterRunning()) {
        std::cerr << "[UpdateSpawner] AutoUpdater already running. Skipping spawn." << std::endl;
        return false;
    }

    std::wstring updaterPath = GetUpdaterPath();

    if (GetFileAttributesW(updaterPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cerr << "[UpdateSpawner] AutoUpdater.exe not found at: ";
        std::wcerr << updaterPath << std::endl;
        return false;
    }

    std::wstring cmdLine = L"\"" + updaterPath + L"\" --payload \"" +
        std::wstring(updatePayload.begin(), updatePayload.end()) + L"\"";

    std::vector<wchar_t> cmdLineBuf(cmdLine.begin(), cmdLine.end());
    cmdLineBuf.push_back(L'\0');

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    BOOL ok = CreateProcessW(
        updaterPath.c_str(),
        cmdLineBuf.data(),
        NULL, NULL, FALSE,
        CREATE_NO_WINDOW,
        NULL,
        PipeProtocol::CORE_DIR,  
        &si,
        &pi
    );

    if (!ok) {
        std::cerr << "[UpdateSpawner] CreateProcess failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[UpdateSpawner] AutoUpdater spawned. PID: " << pi.dwProcessId << std::endl;

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

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
