#include "UpdateManager.h"
#include "../Common/PipeProtocol.h"
#include <iostream>
#include <filesystem>

UpdateManager::~UpdateManager() {
    StopMonitoring();
}

std::wstring UpdateManager::GetBaseDirectory() {
    if (!basePath_.empty()) return basePath_;
    // Use the fixed production path — PipeServer always monitors the agent's install directory
    basePath_ = PipeProtocol::AGENT_BASE_DIR;
    return basePath_;
}

std::wstring UpdateManager::GetAgentPath()   { return GetBaseDirectory() + L"Release\\" + PipeProtocol::AGENT_EXE_NAME; }
std::wstring UpdateManager::GetUpdatesDir()  { return GetBaseDirectory() + PipeProtocol::UPDATE_FOLDER; }
std::wstring UpdateManager::GetBackupDir()   { return GetBaseDirectory() + PipeProtocol::BACKUP_FOLDER; }

bool UpdateManager::CheckForExeInUpdates() {
    std::wstring searchPath = GetUpdatesDir() + L"\\Release\\" + PipeProtocol::AGENT_EXE_NAME;
    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(searchPath.c_str(), &fd);
    if (hFind == INVALID_HANDLE_VALUE) {
        return false;
    }
    FindClose(hFind);
    return true;
}

void UpdateManager::EnsureDirectories() {
    CreateDirectoryW(GetUpdatesDir().c_str(), NULL);
    CreateDirectoryW(GetBackupDir().c_str(), NULL);
    // Ensure the Release subfolder exists for the live agent
    std::wstring releaseDir = GetBaseDirectory() + L"Release";
    CreateDirectoryW(releaseDir.c_str(), NULL);
    // Ensure the update\Release subfolder exists for incoming builds
    std::wstring updateReleaseDir = GetUpdatesDir() + L"\\Release";
    CreateDirectoryW(updateReleaseDir.c_str(), NULL);
    std::cout << "[UpdateManager] Directories ready." << std::endl;
}

void UpdateManager::StartMonitoring(HANDLE updateEvent) {
    if (monitoring_.load()) return;

    hStopMonitor_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    monitoring_.store(true);
    monitorThread_ = std::thread(&UpdateManager::MonitorThreadFunc, this, updateEvent);
    std::cout << "[UpdateManager] Monitoring started." << std::endl;
}

void UpdateManager::StopMonitoring() {
    if (!monitoring_.load()) return;

    monitoring_.store(false);
    if (hStopMonitor_) SetEvent(hStopMonitor_);
    if (monitorThread_.joinable()) monitorThread_.join();
    if (hStopMonitor_) { CloseHandle(hStopMonitor_); hStopMonitor_ = NULL; }
}

void UpdateManager::MonitorThreadFunc(HANDLE updateEvent) {
    std::wcout << L"[Monitor] Polling: " << GetUpdatesDir() << L"\\Release\\" << PipeProtocol::AGENT_EXE_NAME << std::endl;

    while (monitoring_.load()) {
        // Poll every 3 seconds — simple, reliable, no race conditions
        if (WaitForSingleObject(hStopMonitor_, 3000) == WAIT_OBJECT_0) break;

        if (!CheckForExeInUpdates()) continue;

        // Found the exe — verify it's fully written (size stable over 1 second)
        std::wstring exePath = GetUpdatesDir() + L"\\Release\\" + PipeProtocol::AGENT_EXE_NAME;
        LARGE_INTEGER size1 = {}, size2 = {};

        HANDLE hFile = CreateFileW(exePath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                                    NULL, OPEN_EXISTING, 0, NULL);
        if (hFile == INVALID_HANDLE_VALUE) continue;
        GetFileSizeEx(hFile, &size1);
        CloseHandle(hFile);

        if (size1.QuadPart == 0) continue;  // Empty file, still being created

        Sleep(1000);  // Wait 1 second for copy to settle

        hFile = CreateFileW(exePath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                            NULL, OPEN_EXISTING, 0, NULL);
        if (hFile == INVALID_HANDLE_VALUE) continue;
        GetFileSizeEx(hFile, &size2);
        CloseHandle(hFile);

        if (size1.QuadPart != size2.QuadPart) {
            std::cout << "[Monitor] File still being written. Will retry..." << std::endl;
            continue;
        }

        // File is stable and ready
        std::cout << "[Monitor] >>> Update ready (" << size1.QuadPart << " bytes). Signaling." << std::endl;
        SetEvent(updateEvent);

        // Wait until the update is consumed (exe removed by PerformUpdate)
        while (monitoring_.load()) {
            if (WaitForSingleObject(hStopMonitor_, 2000) == WAIT_OBJECT_0) return;
            if (!CheckForExeInUpdates()) {
                std::cout << "[Monitor] Update consumed. Resuming polling." << std::endl;
                break;
            }
        }
    }

    std::cout << "[Monitor] Monitoring thread exiting." << std::endl;
}

bool UpdateManager::IsUpdateAvailable(std::wstring& outPath) {
    std::wstring searchPath = GetUpdatesDir() + L"\\Release\\" + PipeProtocol::AGENT_EXE_NAME;
    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(searchPath.c_str(), &fd);
    if (hFind == INVALID_HANDLE_VALUE) return false;
    outPath = GetUpdatesDir() + L"\\Release\\" + fd.cFileName;
    FindClose(hFind);
    return true;
}

bool UpdateManager::PerformUpdate() {
    std::wstring updateFile;
    if (!IsUpdateAvailable(updateFile)) {
        std::cerr << "[UpdateManager] No update file found." << std::endl;
        return false;
    }

    std::wstring agentPath  = GetAgentPath();
    std::wstring backupExePath = GetBackupDir() + L"\\" + PipeProtocol::AGENT_EXE_NAME;
    std::wstring updateReleaseDir = GetUpdatesDir() + L"\\Release";

    std::wcout << L"[UpdateManager] Paths:" << std::endl;
    std::wcout << L"  updateFile    = " << updateFile << std::endl;
    std::wcout << L"  agentPath     = " << agentPath << std::endl;
    std::wcout << L"  backupExePath = " << backupExePath << std::endl;

    // 1. Backup the old running exe so we can rollback if needed
    DeleteFileW(backupExePath.c_str());
    if (!MoveFileW(agentPath.c_str(), backupExePath.c_str())) {
        DWORD err = GetLastError();
        if (err != ERROR_FILE_NOT_FOUND) {
            std::cerr << "[UpdateManager] Step 1 FAILED: Backup of old exe. Error: " << err << std::endl;
            return false;
        }
        std::cout << "[UpdateManager] Step 1: No existing exe to backup (first install)." << std::endl;
    } else {
        std::cout << "[UpdateManager] Step 1 OK: Old exe backed up." << std::endl;
    }

    // 2. Copy ONLY the new exe from update\Release\ to Agent\Release\
    std::wcout << L"[UpdateManager] Step 2: Copying " << updateFile << L" -> " << agentPath << std::endl;
    if (!CopyFileW(updateFile.c_str(), agentPath.c_str(), FALSE)) {
        std::cerr << "[UpdateManager] Step 2 FAILED: CopyFile error " << GetLastError() << std::endl;
        MoveFileW(backupExePath.c_str(), agentPath.c_str()); // Restore old exe
        return false;
    }
    std::cout << "[UpdateManager] Step 2 OK: New exe installed." << std::endl;

    // 3. Verify the new binary
    if (!VerifyInstalledBinary()) {
        std::cerr << "[UpdateManager] Verification failed. Rolling back." << std::endl;
        DeleteFileW(agentPath.c_str());
        MoveFileW(backupExePath.c_str(), agentPath.c_str());
        return false;
    }

    // 4. Cleanup the update staging directory
    try {
        if (std::filesystem::exists(updateReleaseDir)) {
            std::filesystem::remove_all(updateReleaseDir);
            std::cout << "[UpdateManager] Step 3 OK: update\\Release cleaned up." << std::endl;
        } else {
            DeleteFileW(updateFile.c_str());
        }
    } catch (...) {}

    std::cout << "[UpdateManager] Update installed successfully." << std::endl;
    return true;
}

bool UpdateManager::VerifyInstalledBinary() {
    HANDLE hFile = CreateFileW(GetAgentPath().c_str(), GENERIC_READ, FILE_SHARE_READ,
                                NULL, OPEN_EXISTING, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return false;

    LARGE_INTEGER size;
    bool valid = GetFileSizeEx(hFile, &size) && size.QuadPart > 0;
    CloseHandle(hFile);
    return valid;
}

bool UpdateManager::Rollback() {
    std::wstring agentPath  = GetAgentPath();
    std::wstring backupPath = GetBackupDir() + L"\\" + PipeProtocol::AGENT_EXE_NAME;

    DeleteFileW(agentPath.c_str());
    if (!MoveFileW(backupPath.c_str(), agentPath.c_str())) {
        std::cerr << "[UpdateManager] Rollback failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[UpdateManager] Rollback successful." << std::endl;
    return true;
}
