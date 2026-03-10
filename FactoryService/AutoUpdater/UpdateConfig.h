#pragma once

#include <windows.h>
#include <string>

// ── Directory Layout ────────────────────────────────────────────
//  C:\Factory_Dirs\
//  ├── Core           ← FactoryAgent.exe, FactoryService.exe, AutoUpdater.exe
//  ├── LAI            ← LAI.exe + dependencies
//  ├── update         ← Staging (Agent downloads here)
//  │   ├── Core       ← New Agent, Service builds
//  │   └── LAI        ← New LAI build
//  └── backup         ← AutoUpdater creates before replacing
//      ├── Core
//      └── LAI

namespace UpdateConfig {

    // ── Base Directories ────────────────────────────────────────
    constexpr const wchar_t* BASE_DIR   = L"C:\\Factory_Dirs\\";
    constexpr const wchar_t* CORE_DIR   = L"C:\\Factory_Dirs\\Core\\";
    constexpr const wchar_t* LAI_DIR    = L"C:\\Factory_Dirs\\LAI\\";
    constexpr const wchar_t* UPDATE_DIR = L"C:\\Factory_Dirs\\update\\";
    constexpr const wchar_t* BACKUP_DIR = L"C:\\Factory_Dirs\\backup\\";

    // Subdirectories under update and backup
    constexpr const wchar_t* CORE_SUBDIR = L"Core\\";
    constexpr const wchar_t* LAI_SUBDIR  = L"LAI\\";

    // ── Executable Names ────────────────────────────────────────
    constexpr const wchar_t* AGENT_EXE   = L"FactoryAgent.exe";
    constexpr const wchar_t* SERVICE_EXE = L"FactoryService.exe";
    constexpr const wchar_t* UPDATER_EXE = L"AutoUpdater.exe";
    constexpr const wchar_t* LAI_EXE     = L"LAI.exe";

    // ── Service Identity ────────────────────────────────────────
    constexpr const wchar_t* SERVICE_NAME = L"FactoryUpdateService";

    // ── Timeouts ────────────────────────────────────────────────
    constexpr DWORD PROCESS_EXIT_TIMEOUT_MS  = 10000;  // Wait for graceful exit
    constexpr DWORD SERVICE_STOP_TIMEOUT_MS  = 15000;  // Wait for service to stop
    constexpr DWORD HEALTH_CHECK_TIMEOUT_MS  = 10000;  // Wait for process to appear
    constexpr DWORD HEALTH_CHECK_POLL_MS     = 500;    // Polling interval
    constexpr int   FILE_REPLACE_MAX_RETRIES = 3;
    constexpr DWORD FILE_REPLACE_RETRY_MS    = 2000;

    // ── Update State Machine ────────────────────────────────────
    enum class UpdateState {
        INIT,
        BACKUP,
        STOP_PROCESSES,
        REPLACE_FILES,
        RESTART,
        VERIFY,
        CLEANUP,
        ROLLBACK,
        FAILED,
        DONE
    };

    inline const char* StateToString(UpdateState s) {
        switch (s) {
            case UpdateState::INIT:           return "INIT";
            case UpdateState::BACKUP:         return "BACKUP";
            case UpdateState::STOP_PROCESSES: return "STOP_PROCESSES";
            case UpdateState::REPLACE_FILES:  return "REPLACE_FILES";
            case UpdateState::RESTART:        return "RESTART";
            case UpdateState::VERIFY:         return "VERIFY";
            case UpdateState::CLEANUP:        return "CLEANUP";
            case UpdateState::ROLLBACK:       return "ROLLBACK";
            case UpdateState::FAILED:         return "FAILED";
            case UpdateState::DONE:           return "DONE";
            default:                          return "UNKNOWN";
        }
    }
}
