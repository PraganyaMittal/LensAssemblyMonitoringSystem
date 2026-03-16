#include "ServiceManager.h"
#include "../../Common/PipeProtocol.h"
#include <windows.h>
#include <iostream>

bool ServiceManager::InstallService() {
    wchar_t modulePath[MAX_PATH];
    if (!GetModuleFileNameW(NULL, modulePath, MAX_PATH)) {
        std::cerr << "[ServiceManager] GetModuleFileName failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CREATE_SERVICE);
    if (!hSCM) {
        std::cerr << "[ServiceManager] OpenSCManager failed (run as Admin)." << std::endl;
        return false;
    }

    SC_HANDLE hService = CreateServiceW(
        hSCM, PipeProtocol::SERVICE_NAME, PipeProtocol::SERVICE_DISPLAY,
        SERVICE_ALL_ACCESS, SERVICE_WIN32_OWN_PROCESS,
        SERVICE_DEMAND_START, SERVICE_ERROR_NORMAL,
        modulePath, NULL, NULL, NULL, NULL, NULL
    );

    if (!hService) {
        DWORD err = GetLastError();
        CloseServiceHandle(hSCM);
        if (err == ERROR_SERVICE_EXISTS) {
            std::cout << "[ServiceManager] Service already exists." << std::endl;
            return true;
        }
        std::cerr << "[ServiceManager] CreateService failed. Error: " << err << std::endl;
        return false;
    }

    std::cout << "[ServiceManager] Service installed." << std::endl;
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return true;
}

bool ServiceManager::UninstallService() {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) return false;

    SC_HANDLE hService = OpenServiceW(hSCM, PipeProtocol::SERVICE_NAME, SERVICE_ALL_ACCESS);
    if (!hService) {
        CloseServiceHandle(hSCM);
        return false;
    }

    SERVICE_STATUS status;
    ControlService(hService, SERVICE_CONTROL_STOP, &status);

    bool ok = DeleteService(hService) != 0;
    if (ok) std::cout << "[ServiceManager] Service uninstalled." << std::endl;

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return ok;
}
