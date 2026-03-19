#include "pch.h"
#include "ServiceManager.h"
#include "../../Common/PipeProtocol.h"
#include "ServiceLogger.h"

bool ServiceManager::InstallService() {
    wchar_t modulePath[MAX_PATH];
    if (!GetModuleFileNameW(NULL, modulePath, MAX_PATH)) {
        PIPE_LOG_ERROR("[ServiceManager] GetModuleFileName failed. Error: " << GetLastError());
        return false;
    }

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CREATE_SERVICE);
    if (!hSCM) {
        PIPE_LOG_ERROR("[ServiceManager] OpenSCManager failed (run as Admin).");
        return false;
    }

    SC_HANDLE hService = CreateServiceW(
        hSCM, PipeProtocol::SERVICE_NAME, PipeProtocol::SERVICE_DISPLAY,
        SERVICE_ALL_ACCESS, SERVICE_WIN32_OWN_PROCESS,
        SERVICE_AUTO_START, SERVICE_ERROR_NORMAL,
        modulePath, NULL, NULL, NULL, NULL, NULL
    );

    if (!hService) {
        DWORD err = GetLastError();
        CloseServiceHandle(hSCM);
        if (err == ERROR_SERVICE_EXISTS) {
            PIPE_LOG_INFO("[ServiceManager] Service already exists.");
            return true;
        }
        PIPE_LOG_ERROR("[ServiceManager] CreateService failed. Error: " << err);
        return false;
    }

    PIPE_LOG_INFO("[ServiceManager] Service installed.");
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
    if (ok) PIPE_LOG_INFO("[ServiceManager] Service uninstalled.");

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return ok;
}
