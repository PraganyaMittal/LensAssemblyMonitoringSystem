#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include "../Common/PipeProtocol.h"
#include "PipeHandler.h"
#include "ProcessManager.h"
#include "UpdateManager.h"
#include "UpdateOrchestrator.h"
#include "ServiceManager.h"

SERVICE_STATUS        g_ServiceStatus = {};
SERVICE_STATUS_HANDLE g_StatusHandle  = NULL;
HANDLE                g_StopEvent     = NULL;
HANDLE                g_UpdateEvent   = NULL;

void RunServiceLogic();

// ── Service handlers ──

void WINAPI ServiceCtrlHandler(DWORD ctrlCode) {
    if (ctrlCode == SERVICE_CONTROL_STOP) {
        g_ServiceStatus.dwCurrentState = SERVICE_STOP_PENDING;
        SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
        SetEvent(g_StopEvent);
    } else if (ctrlCode == SERVICE_CONTROL_INTERROGATE) {
        SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
    }
}

void WINAPI ServiceMain(DWORD argc, LPWSTR* argv) {
    g_StatusHandle = RegisterServiceCtrlHandlerW(PipeProtocol::SERVICE_NAME, ServiceCtrlHandler);
    if (!g_StatusHandle) return;

    g_ServiceStatus.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_ServiceStatus.dwCurrentState = SERVICE_START_PENDING;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!g_StopEvent) {
        g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
        SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
        return;
    }

    g_ServiceStatus.dwCurrentState = SERVICE_RUNNING;
    g_ServiceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    RunServiceLogic();

    CloseHandle(g_StopEvent);
    if (g_UpdateEvent) CloseHandle(g_UpdateEvent);
    g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
}

// ── Console mode ──

void RunConsoleMode() {
    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    SetConsoleCtrlHandler([](DWORD ctrlType) -> BOOL {
        if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT) {
            std::cout << "\n[Server] Ctrl+C. Stopping..." << std::endl;
            SetEvent(g_StopEvent);
            return TRUE;
        }
        return FALSE;
    }, TRUE);

    RunServiceLogic();

    CloseHandle(g_StopEvent);
    if (g_UpdateEvent) CloseHandle(g_UpdateEvent);
}

// ── Main service logic ──

void ProcessMessage(const std::string& message, PipeHandler& pipe) {
    std::string command = PipeProtocol::ParseCommand(message);
    std::string payload = PipeProtocol::ParsePayload(message);

    if (command == PipeProtocol::CMD_PING) {
        pipe.WriteMessage(std::string(PipeProtocol::RESP_PONG));
    }
    else if (command == PipeProtocol::CMD_ACK_SHUTDOWN) {
        std::cout << "[Server] Agent acknowledged shutdown." << std::endl;
    }
    else {
        pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "UNKNOWN_COMMAND"));
    }
}

void RunServiceLogic() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Factory Update Service" << std::endl;
    std::cout << "========================================" << std::endl;

    PipeHandler pipe;
    ProcessManager procMgr;
    UpdateManager updMgr;

    if (!pipe.Initialize() || !pipe.CreatePipe()) return;

    updMgr.EnsureDirectories();

    g_UpdateEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!g_UpdateEvent) return;

    updMgr.StartMonitoring(g_UpdateEvent);

    while (WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
        std::cout << "\n[Server] Waiting for agent..." << std::endl;

        int result = pipe.WaitForClient(g_StopEvent, g_UpdateEvent);

        if (result == 1) break;

        if (result == 2) {
            std::cout << "[Server] Update detected (no agent connected)." << std::endl;
            ResetEvent(g_UpdateEvent);
            UpdateOrchestrator::Execute(pipe, procMgr, updMgr, g_StopEvent);
            continue;
        }

        if (result == -1) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            continue;
        }

        std::cout << "[Server] Agent connected." << std::endl;

        bool active = true;
        while (active && WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
            bool interrupted = false;
            std::string message = pipe.ReadMessage(g_StopEvent, g_UpdateEvent, &interrupted);

            if (interrupted) {
                std::cout << "[Server] Update detected. Interrupting session." << std::endl;
                ResetEvent(g_UpdateEvent);
                UpdateOrchestrator::Execute(pipe, procMgr, updMgr, g_StopEvent);
                active = false;
                continue;
            }

            if (message.empty()) {
                std::cout << "[Server] Agent disconnected." << std::endl;
                active = false;
                continue;
            }

            ProcessMessage(message, pipe);
        }

        pipe.DisconnectClient();
    }

    std::cout << "[Server] Stopping..." << std::endl;
    updMgr.StopMonitoring();
    if (pipe.IsClientConnected()) {
        pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_SHUTDOWN));
    }
    pipe.Cleanup();
}

// ── Entry point ──

int wmain(int argc, wchar_t* argv[]) {
    if (argc > 1) {
        std::wstring arg = argv[1];
        if (arg == L"--install")   return ServiceManager::InstallService() ? 0 : 1;
        if (arg == L"--uninstall") return ServiceManager::UninstallService() ? 0 : 1;
        if (arg == L"--console")   { RunConsoleMode(); return 0; }

        std::wcout << L"Usage: PipeServer.exe [--install|--uninstall|--console]" << std::endl;
        return 1;
    }

    SERVICE_TABLE_ENTRYW table[] = {
        { (LPWSTR)PipeProtocol::SERVICE_NAME, ServiceMain },
        { NULL, NULL }
    };

    if (!StartServiceCtrlDispatcherW(table)) {
        std::cout << "[Server] Not started by SCM. Use --console." << std::endl;
        return 1;
    }

    return 0;
}
