#include "UpdateManager.h"
#include "../Common/PipeProtocol.h"
#include <iostream>

UpdateManager::~UpdateManager() {
    StopMonitoring();
}

std::wstring UpdateManager::GetBaseDirectory() {
    if (!basePath_.empty()) return basePath_;

    wchar_t modulePath[MAX_PATH];
    GetModuleFileNameW(NULL, modulePath, MAX_PATH);
    std::wstring dir(modulePath);
    size_t pos = dir.find_last_of(L"\\");
    if (pos != std::wstring::npos) dir = dir.substr(0, pos + 1);
    basePath_ = dir;
    return basePath_;
}

std::wstring UpdateManager::GetAgentPath()   { return GetBaseDirectory() + PipeProtocol::AGENT_EXE_NAME; }
std::wstring UpdateManager::GetUpdatesDir()  { return GetBaseDirectory() + PipeProtocol::UPDATES_FOLDER; }
std::wstring UpdateManager::GetBackupDir()   { return GetBaseDirectory() + PipeProtocol::BACKUP_FOLDER; }

bool UpdateManager::CheckForExeInUpdates() {
    std::wstring searchPath = GetUpdatesDir() + L"\\*.exe";
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
    std::wstring searchPath = GetUpdatesDir() + L"\\*.exe";
    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(searchPath.c_str(), &fd);
    if (hFind == INVALID_HANDLE_VALUE) return false;
    outPath = GetUpdatesDir() + L"\\" + fd.cFileName;
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
    std::wstring backupPath = GetBackupDir() + L"\\" + PipeProtocol::AGENT_EXE_NAME;

    DeleteFileW(backupPath.c_str());
    if (!MoveFileW(agentPath.c_str(), backupPath.c_str())) {
        DWORD err = GetLastError();
        if (err != ERROR_FILE_NOT_FOUND) {
            std::cerr << "[UpdateManager] Backup failed. Error: " << err << std::endl;
            return false;
        }
    }

    if (!CopyFileW(updateFile.c_str(), agentPath.c_str(), FALSE)) {
        std::cerr << "[UpdateManager] Copy failed. Error: " << GetLastError() << std::endl;
        MoveFileW(backupPath.c_str(), agentPath.c_str());
        return false;
    }

    if (!VerifyInstalledBinary()) {
        std::cerr << "[UpdateManager] Verification failed. Rolling back." << std::endl;
        DeleteFileW(agentPath.c_str());
        MoveFileW(backupPath.c_str(), agentPath.c_str());
        return false;
    }

    DeleteFileW(updateFile.c_str());
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
