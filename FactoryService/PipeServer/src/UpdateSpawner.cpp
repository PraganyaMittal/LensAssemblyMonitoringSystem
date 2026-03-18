#include "pch.h"
#include "UpdateSpawner.h"
#include "../../Common/PipeProtocol.h"

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

// Helper: wide string to narrow for logging
static std::string WtoNarrow(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), nullptr, 0, nullptr, nullptr);
    std::string result(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &result[0], size, nullptr, nullptr);
    return result;
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

    // ── Step 3: Replace AutoUpdater.exe if new version is staged ──
    if (GetFileAttributesW(stagedUpdater.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cout << "[UpdateSpawner] No new AutoUpdater in staging. Using existing." << std::endl;
        return true;
    }

    std::cout << "[UpdateSpawner] New AutoUpdater found in staging: " << WtoNarrow(stagedUpdater) << std::endl;

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

bool UpdateSpawner::SpawnAutoUpdater() {
    if (IsUpdaterRunning()) {
        std::cerr << "[UpdateSpawner] AutoUpdater already running. Skipping spawn." << std::endl;
        return false;
    }

    std::wstring updaterPath = GetUpdaterPath();

    if (GetFileAttributesW(updaterPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cerr << "[UpdateSpawner] AutoUpdater.exe not found at: " << WtoNarrow(updaterPath) << std::endl;
        return false;
    }

    // No payload — AutoUpdater reads from update\ directory directly
    std::wstring cmdLine = L"\"" + updaterPath + L"\"";

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
    std::cout << "[UpdateSpawner] Waiting for AutoUpdater to finish..." << std::endl;

    // Wait for AutoUpdater to complete and read exit code
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    if (exitCode == 0) {
        std::cout << "[UpdateSpawner] AutoUpdater completed successfully (exit code 0)." << std::endl;
        return true;
    } else {
        std::cerr << "[UpdateSpawner] AutoUpdater FAILED with exit code: " << exitCode << std::endl;
        return false;
    }
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

