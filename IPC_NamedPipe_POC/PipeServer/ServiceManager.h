#pragma once

#include <windows.h>
#include <iostream>
#include <string>
#include "../Common/PipeProtocol.h"

// Handles Windows Service installation, uninstallation, and SCM registration
class ServiceManager {
public:
    // Install the service into Windows SCM
    static bool InstallService() {
        wchar_t modulePath[MAX_PATH];
        if (!GetModuleFileNameW(NULL, modulePath, MAX_PATH)) {
            std::cerr << "[ServiceManager] GetModuleFileName failed. Error: " << GetLastError() << std::endl;
            return false;
        }

        SC_HANDLE hSCManager = OpenSCManagerW(NULL, NULL, SC_MANAGER_CREATE_SERVICE);
        if (!hSCManager) {
            std::cerr << "[ServiceManager] OpenSCManager failed. Error: " << GetLastError() << std::endl;
            std::cerr << "[ServiceManager] Are you running as Administrator?" << std::endl;
            return false;
        }

        SC_HANDLE hService = CreateServiceW(
            hSCManager,
            PipeProtocol::SERVICE_NAME,
            PipeProtocol::SERVICE_DISPLAY,
            SERVICE_ALL_ACCESS,
            SERVICE_WIN32_OWN_PROCESS,
            SERVICE_DEMAND_START,       // manual start for POC
            SERVICE_ERROR_NORMAL,
            modulePath,
            NULL, NULL, NULL, NULL, NULL
        );

        if (!hService) {
            DWORD err = GetLastError();
            if (err == ERROR_SERVICE_EXISTS) {
                std::cout << "[ServiceManager] Service already exists." << std::endl;
            } else {
                std::cerr << "[ServiceManager] CreateService failed. Error: " << err << std::endl;
            }
            CloseServiceHandle(hSCManager);
            return err == ERROR_SERVICE_EXISTS;
        }

        std::cout << "[ServiceManager] Service installed successfully!" << std::endl;
        CloseServiceHandle(hService);
        CloseServiceHandle(hSCManager);
        return true;
    }

    // Uninstall the service from Windows SCM
    static bool UninstallService() {
        SC_HANDLE hSCManager = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
        if (!hSCManager) {
            std::cerr << "[ServiceManager] OpenSCManager failed. Error: " << GetLastError() << std::endl;
            return false;
        }

        SC_HANDLE hService = OpenServiceW(hSCManager, PipeProtocol::SERVICE_NAME, SERVICE_ALL_ACCESS);
        if (!hService) {
            std::cerr << "[ServiceManager] OpenService failed. Error: " << GetLastError() << std::endl;
            CloseServiceHandle(hSCManager);
            return false;
        }

        // Stop the service first if it's running
        SERVICE_STATUS status;
        ControlService(hService, SERVICE_CONTROL_STOP, &status);

        if (!DeleteService(hService)) {
            std::cerr << "[ServiceManager] DeleteService failed. Error: " << GetLastError() << std::endl;
            CloseServiceHandle(hService);
            CloseServiceHandle(hSCManager);
            return false;
        }

        std::cout << "[ServiceManager] Service uninstalled successfully!" << std::endl;
        CloseServiceHandle(hService);
        CloseServiceHandle(hSCManager);
        return true;
    }
};
