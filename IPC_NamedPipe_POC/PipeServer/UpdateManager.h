#pragma once

#include <windows.h>
#include <iostream>
#include <string>
#include "../Common/PipeProtocol.h"

// Handles checking for updates, backing up old binary, and replacing with new binary
class UpdateManager {
private:
    std::wstring basePath;  // directory where server exe lives

    // Get the directory of the running server executable
    std::wstring GetBaseDirectory() {
        if (!basePath.empty()) return basePath;

        wchar_t modulePath[MAX_PATH];
        GetModuleFileNameW(NULL, modulePath, MAX_PATH);
        std::wstring dir(modulePath);
        size_t lastSlash = dir.find_last_of(L"\\");
        if (lastSlash != std::wstring::npos) {
            dir = dir.substr(0, lastSlash + 1);
        }
        basePath = dir;
        return basePath;
    }

    std::wstring GetAgentPath() {
        return GetBaseDirectory() + PipeProtocol::AGENT_EXE_NAME;
    }

    std::wstring GetUpdatesDir() {
        return GetBaseDirectory() + PipeProtocol::UPDATES_FOLDER;
    }

    std::wstring GetBackupDir() {
        return GetBaseDirectory() + PipeProtocol::BACKUP_FOLDER;
    }

public:
    // Ensure updates/ and backup/ directories exist
    void EnsureDirectories() {
        CreateDirectoryW(GetUpdatesDir().c_str(), NULL);
        CreateDirectoryW(GetBackupDir().c_str(), NULL);
        std::cout << "[UpdateManager] Directories ready." << std::endl;
    }

    // Check if a new version exists in the updates/ folder
    // Looks for any .exe file in updates/
    bool IsUpdateAvailable(std::wstring& outUpdateFilePath) {
        std::wstring searchPath = GetUpdatesDir() + L"\\*.exe";

        WIN32_FIND_DATAW findData;
        HANDLE hFind = FindFirstFileW(searchPath.c_str(), &findData);

        if (hFind == INVALID_HANDLE_VALUE) {
            return false; // no files found
        }

        outUpdateFilePath = GetUpdatesDir() + L"\\" + findData.cFileName;
        FindClose(hFind);

        std::wcout << L"[UpdateManager] Update found: " << findData.cFileName << std::endl;
        return true;
    }

    // Overload without out parameter — for simple yes/no check
    bool IsUpdateAvailable() {
        std::wstring dummy;
        return IsUpdateAvailable(dummy);
    }

    // Perform the full update: backup → replace → cleanup
    bool PerformUpdate() {
        std::wstring updateFile;
        if (!IsUpdateAvailable(updateFile)) {
            std::cerr << "[UpdateManager] No update file found." << std::endl;
            return false;
        }

        std::wstring agentPath = GetAgentPath();
        std::wstring backupPath = GetBackupDir() + L"\\" + PipeProtocol::AGENT_EXE_NAME;

        // Step 1: Backup old binary
        std::cout << "[UpdateManager] Backing up old agent..." << std::endl;
        // Delete any existing backup first
        DeleteFileW(backupPath.c_str());
        if (!MoveFileW(agentPath.c_str(), backupPath.c_str())) {
            DWORD err = GetLastError();
            if (err != ERROR_FILE_NOT_FOUND) {
                std::cerr << "[UpdateManager] Failed to backup old agent. Error: " << err << std::endl;
                return false;
            }
            // If old agent doesn't exist, that's fine (first install)
            std::cout << "[UpdateManager] No existing agent to backup (first install)." << std::endl;
        } else {
            std::cout << "[UpdateManager] Old agent backed up." << std::endl;
        }

        // Step 2: Copy new binary into place
        std::cout << "[UpdateManager] Installing new agent..." << std::endl;
        if (!CopyFileW(updateFile.c_str(), agentPath.c_str(), FALSE)) {
            std::cerr << "[UpdateManager] Failed to copy new agent. Error: " << GetLastError() << std::endl;

            // Try to restore backup
            std::cerr << "[UpdateManager] Attempting rollback..." << std::endl;
            MoveFileW(backupPath.c_str(), agentPath.c_str());
            return false;
        }
        std::cout << "[UpdateManager] New agent installed." << std::endl;

        // Step 3: Clean up the update file
        DeleteFileW(updateFile.c_str());
        std::cout << "[UpdateManager] Update file cleaned up." << std::endl;

        return true;
    }

    // Rollback: restore the backed-up binary
    bool Rollback() {
        std::wstring agentPath = GetAgentPath();
        std::wstring backupPath = GetBackupDir() + L"\\" + PipeProtocol::AGENT_EXE_NAME;

        std::cout << "[UpdateManager] Rolling back to previous version..." << std::endl;
        DeleteFileW(agentPath.c_str());

        if (!MoveFileW(backupPath.c_str(), agentPath.c_str())) {
            std::cerr << "[UpdateManager] Rollback failed. Error: " << GetLastError() << std::endl;
            return false;
        }

        std::cout << "[UpdateManager] Rollback successful." << std::endl;
        return true;
    }
};
