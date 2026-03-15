#pragma once

#include <windows.h>
#include <string>












namespace UpdateConfig {

    
    constexpr const wchar_t* BASE_DIR   = L"C:\\Factory_Dirs\\";
    constexpr const wchar_t* CORE_DIR   = L"C:\\Factory_Dirs\\Core\\";
    constexpr const wchar_t* LAI_DIR    = L"C:\\Factory_Dirs\\LAI\\";
    constexpr const wchar_t* UPDATE_DIR = L"C:\\Factory_Dirs\\update\\";
    constexpr const wchar_t* BACKUP_DIR = L"C:\\Factory_Dirs\\backup\\";

    
    constexpr const wchar_t* CORE_SUBDIR = L"Core\\";
    constexpr const wchar_t* LAI_SUBDIR  = L"LAI\\";

    
    constexpr const wchar_t* AGENT_EXE   = L"FactoryAgent.exe";
    constexpr const wchar_t* SERVICE_EXE = L"FactoryService.exe";
    constexpr const wchar_t* UPDATER_EXE = L"AutoUpdater.exe";
    constexpr const wchar_t* LAI_EXE     = L"LAI.exe";

    
    constexpr const wchar_t* SERVICE_NAME = L"FactoryUpdateService";

    
    constexpr DWORD PROCESS_EXIT_TIMEOUT_MS  = 10000;  
    constexpr DWORD SERVICE_STOP_TIMEOUT_MS  = 15000;  
    constexpr DWORD HEALTH_CHECK_TIMEOUT_MS  = 10000;  
    constexpr DWORD HEALTH_CHECK_POLL_MS     = 500;    
    constexpr int   FILE_REPLACE_MAX_RETRIES = 3;
    constexpr DWORD FILE_REPLACE_RETRY_MS    = 2000;

    
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
