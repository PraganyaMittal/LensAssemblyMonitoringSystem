#include "UpdateSpawner.h"
#include "../Common/PipeProtocol.h"
#include <tlhelp32.h>
#include <iostream>
#include <filesystem>

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
    std::wstring stagedPath = GetStagedUpdaterPath();
    std::wstring currentPath = GetUpdaterPath();
    std::wstring backupPath = GetBackupUpdaterPath();

    
    if (GetFileAttributesW(stagedPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
        std::cout << "[UpdateSpawner] No new AutoUpdater in staging. Using existing." << std::endl;
        return true;
    }

    std::wcout << L"[UpdateSpawner] New AutoUpdater found in staging: " << stagedPath << std::endl;

    
    std::wstring backupDir = std::wstring(PipeProtocol::BACKUP_DIR) + L"Core";
    CreateDirectoryW(PipeProtocol::BACKUP_DIR, NULL);
    CreateDirectoryW(backupDir.c_str(), NULL);

    
    if (GetFileAttributesW(currentPath.c_str()) != INVALID_FILE_ATTRIBUTES) {
        DeleteFileW(backupPath.c_str());
        if (!MoveFileW(currentPath.c_str(), backupPath.c_str())) {
            std::cerr << "[UpdateSpawner] Failed to backup current updater. Error: " << GetLastError() << std::endl;
            return false;
        }
        std::cout << "[UpdateSpawner] Current updater backed up." << std::endl;
    }

    
    if (!CopyFileW(stagedPath.c_str(), currentPath.c_str(), FALSE)) {
        std::cerr << "[UpdateSpawner] Failed to copy new updater. Error: " << GetLastError() << std::endl;
        MoveFileW(backupPath.c_str(), currentPath.c_str());
        return false;
    }
    std::cout << "[UpdateSpawner] New updater installed." << std::endl;

    DeleteFileW(stagedPath.c_str());

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

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    BOOL ok = CreateProcessW(
        updaterPath.c_str(),
        const_cast<LPWSTR>(cmdLine.c_str()),
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
