#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <fstream>
#include <filesystem>
#include "UpdateConfig.h"
#include "BackupManager.h"
#include "ProcessController.h"
#include "FileReplacer.h"
#include "HealthChecker.h"

namespace fs = std::filesystem;

static std::ofstream g_logFile;

static void InitLog() {
    try {
        fs::create_directories(UpdateConfig::LOG_DIR);
    } catch (...) {
        std::cerr << "[AutoUpdater] WARNING: Could not create log directory." << std::endl;
    }
    std::wstring logPath = std::wstring(UpdateConfig::LOG_DIR) + L"autoupdater_log.txt";
    g_logFile.open(logPath, std::ios::app);
    if (!g_logFile.is_open()) {
        std::cerr << "[AutoUpdater] WARNING: Could not open log file." << std::endl;
    }
}

static std::string GetTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    struct tm buf;
    localtime_s(&buf, &time);
    char ts[32];
    strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", &buf);
    return std::string(ts);
}

static void Log(UpdateConfig::UpdateState state, const char* msg) {
    std::string stateStr = UpdateConfig::StateToString(state);
    std::string timestamp = GetTimestamp();
    std::cout << "[" << timestamp << "] [AutoUpdater] [" << stateStr << "] " << msg << std::endl;
    if (g_logFile.is_open()) {
        g_logFile << "[" << timestamp << "] [AutoUpdater] [" << stateStr << "] " << msg << std::endl;
    }
}



static int RunUpdateProcedure() {
    auto state = UpdateConfig::UpdateState::INIT;
    Log(state, "AutoUpdater started.");

    // ── Check for stale update (previous run crashed mid-replace) ──
    bool isResumingAfterCrash = fs::exists(UpdateConfig::UPDATE_MARKER_FILE);
    if (isResumingAfterCrash) {
        Log(state, "WARNING: Found .update_in_progress marker. Previous run crashed mid-update.");
        Log(state, "Skipping backup phase (existing backup is the good version).");
    }

    // ── Phase 1: STOP all processes ──
    state = UpdateConfig::UpdateState::STOP_PROCESSES;
    Log(state, "Stopping all processes...");

    if (!ProcessController::StopAgent()) {
        Log(state, "Failed to stop Agent. Proceeding with update.");
    }
    if (!ProcessController::StopLAI()) {
        Log(state, "Failed to stop LAI. Proceeding with update.");
    }
    if (!ProcessController::StopService()) {
        Log(state, "Failed to stop Service. Proceeding with update.");
    }
    Log(state, "All processes stopped.");

    // ── Phase 2: BACKUP (skip if resuming after crash) ──
    if (!isResumingAfterCrash) {
        state = UpdateConfig::UpdateState::BACKUP;
        Log(state, "Creating backups...");

        if (!BackupManager::BackupCore()) {
            Log(state, "FAILED to backup Core files.");
            return UpdateConfig::EXIT_BACKUP_FAILED;
        }
        if (!BackupManager::BackupLAI()) {
            Log(state, "FAILED to backup LAI.");
            return UpdateConfig::EXIT_BACKUP_FAILED;
        }
        Log(state, "Backups created successfully.");
    }

    // ── Phase 3: REPLACE files from staging ──
    // Write marker BEFORE replacing — if we crash after this, next run skips backup
    state = UpdateConfig::UpdateState::REPLACE_FILES;
    Log(state, "Replacing files from staging...");

    try {
        std::ofstream marker(UpdateConfig::UPDATE_MARKER_FILE);
        marker << "Update started at: " << GetTimestamp() << std::endl;
        marker.close();
    } catch (...) {
        Log(state, "WARNING: Could not write update marker file.");
    }

    if (!FileReplacer::ReplaceCore()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "FAILED to replace Core files.");
        return UpdateConfig::EXIT_REPLACE_FAILED;
    }
    if (!FileReplacer::ReplaceLAI()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "FAILED to replace LAI files.");
        return UpdateConfig::EXIT_REPLACE_FAILED;
    }
    Log(state, "Files replaced successfully.");

    // ── Phase 4: RESTART all processes ──
    state = UpdateConfig::UpdateState::RESTART;
    Log(state, "Restarting all processes...");

    if (!ProcessController::StartService()) {
        Log(state, "FAILED to start Service.");
        return UpdateConfig::EXIT_RESTART_FAILED;
    }

    if (!ProcessController::StartAgent()) {
        Log(state, "FAILED to start Agent.");
        return UpdateConfig::EXIT_RESTART_FAILED;
    }

    ProcessController::StartLAI();
    Log(state, "All processes restarted.");

    // ── Phase 5: VERIFY health ──
    state = UpdateConfig::UpdateState::VERIFY;
    Log(state, "Running health checks...");

    if (!HealthChecker::VerifyAll()) {
        state = UpdateConfig::UpdateState::FAILED;
        Log(state, "Health check FAILED.");
        return UpdateConfig::EXIT_HEALTHCHECK_FAILED;
    }
    Log(state, "All health checks passed.");

    // ── Phase 6: CLEANUP ──
    state = UpdateConfig::UpdateState::CLEANUP;
    Log(state, "Cleaning up staging directory...");
    FileReplacer::CleanupStaging();

    // Delete marker — update completed successfully, safe for next backup
    try {
        fs::remove(UpdateConfig::UPDATE_MARKER_FILE);
    } catch (...) {}

    state = UpdateConfig::UpdateState::DONE;
    Log(state, "Update completed successfully!");
    return UpdateConfig::EXIT_SUCCESS_CODE;
}


int wmain(int argc, wchar_t* argv[]) {
    InitLog();
    Log(UpdateConfig::UpdateState::INIT, "========================================");
    Log(UpdateConfig::UpdateState::INIT, "  Factory AutoUpdater");
    Log(UpdateConfig::UpdateState::INIT, "========================================");

    int result = RunUpdateProcedure();

    std::string exitMsg = "Exit code: " + std::to_string(result);
    Log(UpdateConfig::UpdateState::DONE, exitMsg.c_str());

    if (g_logFile.is_open()) {
        g_logFile.close();
    }
    return result;
}
