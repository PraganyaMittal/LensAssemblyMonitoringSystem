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

std::wstring UpdateManager::GetAgentPath()   { return GetBaseDirectory() + PipeProtocol::AGENT_EXE_NAME; }
std::wstring UpdateManager::GetUpdatesDir()  { return GetBaseDirectory() + PipeProtocol::UPDATE_FOLDER; }
std::wstring UpdateManager::GetBackupDir()   { return GetBaseDirectory() + PipeProtocol::BACKUP_FOLDER; }

bool UpdateManager::CheckForExeInUpdates() {
    std::wstring searchPath = GetUpdatesDir() + L"\\Release\\" + PipeProtocol::AGENT_EXE_NAME;
    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(searchPath.c_str(), &fd);
    if (hFind == INVALID_HANDLE_VALUE) return false;
    FindClose(hFind);
    return true;
}

void UpdateManager::EnsureDirectories() {
    CreateDirectoryW(GetUpdatesDir().c_str(), NULL);
    CreateDirectoryW(GetBackupDir().c_str(), NULL);
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
    std::wstring updatesDir = GetUpdatesDir();

    HANDLE hChange = FindFirstChangeNotificationW(
        updatesDir.c_str(), FALSE,
        FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_SIZE | FILE_NOTIFY_CHANGE_LAST_WRITE
    );

    if (hChange == INVALID_HANDLE_VALUE) {
        std::cerr << "[UpdateManager] Filesystem watch failed. Falling back to polling." << std::endl;

        while (monitoring_.load()) {
            if (WaitForSingleObject(hStopMonitor_, PipeProtocol::UPDATE_POLL_INTERVAL_MS) == WAIT_OBJECT_0) break;
            if (CheckForExeInUpdates()) {
                std::cout << "[UpdateManager] Update detected (poll)." << std::endl;
                SetEvent(updateEvent);
                while (monitoring_.load()) {
                    if (WaitForSingleObject(hStopMonitor_, 1000) == WAIT_OBJECT_0) break;
                    if (!CheckForExeInUpdates()) break;
                }
            }
        }
        return;
    }

    if (CheckForExeInUpdates()) {
        std::cout << "[UpdateManager] Update file already present." << std::endl;
        SetEvent(updateEvent);
    }

    HANDLE waitHandles[] = { hChange, hStopMonitor_ };

    while (monitoring_.load()) {
        DWORD result = WaitForMultipleObjects(2, waitHandles, FALSE, INFINITE);

        if (result != WAIT_OBJECT_0) break;

        Sleep(500);

        if (CheckForExeInUpdates()) {
            std::cout << "[UpdateManager] Update detected." << std::endl;
            SetEvent(updateEvent);

            while (monitoring_.load()) {
                if (WaitForSingleObject(hStopMonitor_, 2000) == WAIT_OBJECT_0) {
                    FindCloseChangeNotification(hChange);
                    return;
                }
                if (!CheckForExeInUpdates()) break;
            }
        }

        if (!FindNextChangeNotification(hChange)) break;

        if (CheckForExeInUpdates()) {
            std::cout << "[UpdateManager] File detected in re-arm gap." << std::endl;
            SetEvent(updateEvent);

            while (monitoring_.load()) {
                if (WaitForSingleObject(hStopMonitor_, 2000) == WAIT_OBJECT_0) {
                    FindCloseChangeNotification(hChange);
                    return;
                }
                if (!CheckForExeInUpdates()) break;
            }
        }
    }

    FindCloseChangeNotification(hChange);
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
    std::wstring backupReleaseDir = GetBackupDir() + L"\\Release";

    // 1. Save the old running agent exe so we can rollback immediately if needed
    DeleteFileW(backupExePath.c_str());
    if (!MoveFileW(agentPath.c_str(), backupExePath.c_str())) {
        DWORD err = GetLastError();
        if (err != ERROR_FILE_NOT_FOUND) {
            std::cerr << "[UpdateManager] Backup of old exe failed. Error: " << err << std::endl;
            return false;
        }
    }

    // 2. Paste the whole new Release folder into backup (cache current version files)
    try {
        if (std::filesystem::exists(backupReleaseDir)) {
            std::filesystem::remove_all(backupReleaseDir);
        }
        std::filesystem::copy(updateReleaseDir, backupReleaseDir, std::filesystem::copy_options::recursive | std::filesystem::copy_options::overwrite_existing);
    } catch (const std::exception& e) {
        std::cerr << "[UpdateManager] Failed to copy Release folder to backup: " << e.what() << std::endl;
        // Proceed anyway, the primary copy will fallback to updateFile if needed
    }

    // 3. Take only the .exe and copy it to the main Agent path
    std::wstring newExeInBackup = backupReleaseDir + L"\\" + PipeProtocol::AGENT_EXE_NAME;
    std::wstring sourceExe = std::filesystem::exists(newExeInBackup) ? newExeInBackup : updateFile;

    if (!CopyFileW(sourceExe.c_str(), agentPath.c_str(), FALSE)) {
        std::cerr << "[UpdateManager] Copy failed. Error: " << GetLastError() << std::endl;
        MoveFileW(backupExePath.c_str(), agentPath.c_str()); // Restore old exe
        return false;
    }

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
