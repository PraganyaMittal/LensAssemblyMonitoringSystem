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



static void Log(UpdateConfig::UpdateState state, const char* msg) {
    std::cout << "[AutoUpdater] [" << UpdateConfig::StateToString(state) << "] " << msg << std::endl;
}



static void PerformRollback(UpdateConfig::UpdateState& state) {
    state = UpdateConfig::UpdateState::ROLLBACK;
    Log(state, "Starting rollback...");

    
    ProcessController::StopAgent();
    ProcessController::StopLAI();
    ProcessController::StopService();

    std::this_thread::sleep_for(std::chrono::seconds(2));

    
    BackupManager::RestoreCore();
    BackupManager::RestoreLAI();

    
    ProcessController::StartService();
    std::this_thread::sleep_for(std::chrono::seconds(3));
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
        Log(state, "WARNING: Could not stop Agent. Continuing anyway.");
    }
    if (!ProcessController::StopLAI()) {
        Log(state, "WARNING: Could not stop LAI. Continuing anyway.");
    }
    if (!ProcessController::StopService()) {
        Log(state, "WARNING: Could not stop Service. Continuing anyway.");
    }

    
    std::this_thread::sleep_for(std::chrono::seconds(2));
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

    
    std::this_thread::sleep_for(std::chrono::seconds(3));

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
    return result;
}
