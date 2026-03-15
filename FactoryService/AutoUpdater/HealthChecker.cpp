#include "HealthChecker.h"
#include "ProcessController.h"
#include "UpdateConfig.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <filesystem>

namespace fs = std::filesystem;

bool HealthChecker::VerifyServiceRunning(DWORD timeoutMs) {
    std::cout << "[HealthCheck] Waiting for FactoryService..." << std::endl;

    DWORD start = GetTickCount();
    while (GetTickCount() - start < timeoutMs) {
        
        SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
        if (hSCM) {
            SC_HANDLE hService = OpenServiceW(hSCM, UpdateConfig::SERVICE_NAME, SERVICE_QUERY_STATUS);
            if (hService) {
                SERVICE_STATUS status = {};
                if (QueryServiceStatus(hService, &status) && status.dwCurrentState == SERVICE_RUNNING) {
                    CloseServiceHandle(hService);
                    CloseServiceHandle(hSCM);
                    std::cout << "[HealthCheck] FactoryService is running." << std::endl;
                    return true;
                }
                CloseServiceHandle(hService);
            }
            CloseServiceHandle(hSCM);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
    }

    std::cerr << "[HealthCheck] FactoryService NOT running after timeout." << std::endl;
    return false;
}

bool HealthChecker::VerifyAgentRunning(DWORD timeoutMs) {
    std::cout << "[HealthCheck] Waiting for Agent..." << std::endl;

    DWORD start = GetTickCount();
    while (GetTickCount() - start < timeoutMs) {
        if (ProcessController::IsProcessRunning(UpdateConfig::AGENT_EXE)) {
            std::cout << "[HealthCheck] Agent is running." << std::endl;
            return true;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
    }

    std::cerr << "[HealthCheck] Agent NOT running after timeout." << std::endl;
    return false;
}

bool HealthChecker::VerifyLAIRunning(DWORD timeoutMs) {
    
    std::wstring laiPath = std::wstring(UpdateConfig::LAI_DIR) + UpdateConfig::LAI_EXE;
    if (!fs::exists(laiPath)) {
        std::cout << "[HealthCheck] LAI.exe not deployed. Skipping verification." << std::endl;
        return true;
    }

    std::cout << "[HealthCheck] Waiting for LAI..." << std::endl;

    DWORD start = GetTickCount();
    while (GetTickCount() - start < timeoutMs) {
        if (ProcessController::IsProcessRunning(UpdateConfig::LAI_EXE)) {
            std::cout << "[HealthCheck] LAI is running." << std::endl;
            return true;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
    }

    std::cerr << "[HealthCheck] LAI NOT running after timeout." << std::endl;
    return false;
}

bool HealthChecker::VerifyAll() {
    bool serviceOk = VerifyServiceRunning(UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
    bool agentOk   = VerifyAgentRunning(UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
    bool laiOk     = VerifyLAIRunning(UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);

    if (serviceOk && agentOk && laiOk) {
        std::cout << "[HealthCheck] All components verified successfully." << std::endl;
        return true;
    }

    std::cerr << "[HealthCheck] Verification FAILED. Service=" << serviceOk
              << " Agent=" << agentOk << " LAI=" << laiOk << std::endl;
    return false;
}
