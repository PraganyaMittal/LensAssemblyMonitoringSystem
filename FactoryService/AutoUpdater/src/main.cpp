#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include "UpdateConfig.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "FileReplacer.h"
#include "HealthChecker.h"

#include <fstream>

static std::ofstream g_logFile;

static void InitLog() {
    g_logFile.open("C:\\FactoryPlatform\\autoupdater_log.txt", std::ios::app);
}

static void Log(UpdateConfig::UpdateState state, const char* msg) {
    std::string stateStr = UpdateConfig::StateToString(state);
    std::cout << "[AutoUpdater] [" << stateStr << "] " << msg << std::endl;
    if (g_logFile.is_open()) {
        g_logFile << "[AutoUpdater] [" << stateStr << "] " << msg << std::endl;
    }
}



static void PerformRollback(UpdateConfig::UpdateState& state) {
    state = UpdateConfig::UpdateState::ROLLBACK;
    Log(state, "Starting rollback...");

    
    ProcessController::StopAgent();
    ProcessController::StopLAI();
    ProcessController::StopService();

    
    BackupManager::RestoreCore();
    BackupManager::RestoreLAI();

    
    ProcessController::StartService();
    ProcessController::StartAgent();
    ProcessController::StartLAI();

    Log(state, "Rollback completed. Old versions restored.");
}



static int RunUpdateProcedure() {
    auto state = UpdateConfig::UpdateState::INIT;
    Log(state, "AutoUpdater started.");

    
    state = UpdateConfig::UpdateState::BACKUP;
    Log(state, "Creating backups...");

    if (!BackupManager::BackupCore()) {
        Log(state, "FAILED to backup Core.");
        return 1;
    }
    if (!BackupManager::BackupLAI()) {
        Log(state, "FAILED to backup LAI.");
        return 1;
    }
    Log(state, "Backups created successfully.");

    
    state = UpdateConfig::UpdateState::STOP_PROCESSES;
    Log(state, "Stopping all processes...");

    if (!ProcessController::StopAgent()) {
        Log(state, "Failed to terminate Agent process. Proceeding with update.");
    }
    if (!ProcessController::StopLAI()) {
        Log(state, "Failed to terminate LAI process. Proceeding with update.");
    }
    if (!ProcessController::StopService()) {
        Log(state, "Failed to terminate Service process. Proceeding with update.");
    }

    Log(state, "All processes stopped.");

    
    state = UpdateConfig::UpdateState::REPLACE_FILES;
    Log(state, "Replacing files from staging...");

    if (!FileReplacer::ReplaceCore()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "FAILED to replace Core files. Rolling back.");
        PerformRollback(state);
        return 1;
    }
    if (!FileReplacer::ReplaceLAI()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "FAILED to replace LAI files. Rolling back.");
        PerformRollback(state);
        return 1;
    }
    Log(state, "Files replaced successfully.");

    
    state = UpdateConfig::UpdateState::RESTART;
    Log(state, "Restarting all processes...");

    if (!ProcessController::StartService()) {
        Log(state, "FAILED to start Service. Rolling back.");
        PerformRollback(state);
        return 1;
    }

    if (!ProcessController::StartAgent()) {
        Log(state, "FAILED to start Agent. Rolling back.");
        PerformRollback(state);
        return 1;
    }

    ProcessController::StartLAI();  

    Log(state, "All processes restarted.");

    
    state = UpdateConfig::UpdateState::VERIFY;
    Log(state, "Running health checks...");

    if (!HealthChecker::VerifyAll()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "Health check FAILED. Rolling back.");
        PerformRollback(state);
        return 1;
    }
    Log(state, "All health checks passed.");

    
    state = UpdateConfig::UpdateState::CLEANUP;
    Log(state, "Cleaning up staging and backup directories...");

    BackupManager::CleanupBackup();  

    state = UpdateConfig::UpdateState::DONE;
    Log(state, "Update completed successfully!");

    return 0;
}



int wmain(int argc, wchar_t* argv[]) {
    InitLog();
    std::cout << "========================================" << std::endl;
    std::cout << "  Factory AutoUpdater" << std::endl;
    std::cout << "========================================" << std::endl;

    std::string payload;
    for (int i = 1; i < argc; i++) {
        if (wcscmp(argv[i], L"--payload") == 0 && i + 1 < argc) {
            int len = WideCharToMultiByte(CP_UTF8, 0, argv[i + 1], -1, NULL, 0, NULL, NULL);
            if (len > 0) {
                payload.resize(len - 1);
                WideCharToMultiByte(CP_UTF8, 0, argv[i + 1], -1, &payload[0], len, NULL, NULL);
            }
            i++;
        }
    }

    if (!payload.empty()) {
        std::cout << "[AutoUpdater] Payload: " << payload << std::endl;
    }

    int result = RunUpdateProcedure();

    std::cout << "[AutoUpdater] Exit code: " << result << std::endl;
    if (g_logFile.is_open()) {
        g_logFile.close();
    }
    return result;
}
