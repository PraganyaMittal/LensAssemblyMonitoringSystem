#include "pch.h"
#include "../../Common/PipeProtocol.h"
#include "PipeHandler.h"
#include "UpdateSpawner.h"
#include "ServiceManager.h"

SERVICE_STATUS        g_ServiceStatus = {};
SERVICE_STATUS_HANDLE g_StatusHandle  = NULL;
HANDLE                g_StopEvent     = NULL;
HANDLE                g_ServiceThread = NULL;

void RunServiceLogic();



void WINAPI ServiceCtrlHandler(DWORD ctrlCode) {
    if (ctrlCode == SERVICE_CONTROL_STOP) {
        g_ServiceStatus.dwCurrentState = SERVICE_STOP_PENDING;
        SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
        SetEvent(g_StopEvent);
        if (g_ServiceThread) {
            CancelSynchronousIo(g_ServiceThread);
        }
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

    DuplicateHandle(
        GetCurrentProcess(), GetCurrentThread(),
        GetCurrentProcess(), &g_ServiceThread,
        0, FALSE, DUPLICATE_SAME_ACCESS
    );

    g_ServiceStatus.dwCurrentState = SERVICE_RUNNING;
    g_ServiceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    RunServiceLogic();

    if (g_StopEvent) { CloseHandle(g_StopEvent); g_StopEvent = NULL; }
    if (g_ServiceThread) { CloseHandle(g_ServiceThread); g_ServiceThread = NULL; }
    g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
}



void RunConsoleMode() {
    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    DuplicateHandle(
        GetCurrentProcess(), GetCurrentThread(),
        GetCurrentProcess(), &g_ServiceThread,
        0, FALSE, DUPLICATE_SAME_ACCESS
    );

    SetConsoleCtrlHandler([](DWORD ctrlType) -> BOOL {
        if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT) {
            std::cout << "\n[Service] Ctrl+C. Stopping..." << std::endl;
            SetEvent(g_StopEvent);
            if (g_ServiceThread) {
                CancelSynchronousIo(g_ServiceThread);
            }
            return TRUE;
        }
        return FALSE;
    }, TRUE);

    RunServiceLogic();

    CloseHandle(g_StopEvent);
    if (g_ServiceThread) {
        CloseHandle(g_ServiceThread);
        g_ServiceThread = NULL;
    }
}



void ProcessMessage(const std::string& message, PipeHandler& pipe) {
    std::string command = PipeProtocol::ParseCommand(message);
    std::string payload = PipeProtocol::ParsePayload(message);

    if (command == PipeProtocol::CMD_NOTIFY_UPDATE) {
        std::cout << "[Service] Received NOTIFY_UPDATE from Agent." << std::endl;

        
        if (pipe.IsClientConnected()) {
            pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_UPDATE_NOW));

            
            bool gotAck = false;
            for (int i = 0; i < 10 && pipe.IsClientConnected(); i++) {
                std::string msg = pipe.ReadMessageWithTimeout(2000);
                if (msg.empty()) continue;

                if (PipeProtocol::ParseCommand(msg) == PipeProtocol::CMD_ACK_SHUTDOWN) {
                    std::cout << "[Service] Agent acknowledged shutdown." << std::endl;
                    gotAck = true;
                    break;
                }
            }
            if (!gotAck) {
                std::cout << "[Service] No ACK received. Proceeding anyway." << std::endl;
            }
        }

        
        if (!UpdateSpawner::UpdateUpdaterExe()) {
            std::cerr << "[Service] Failed to update AutoUpdater.exe. Aborting." << std::endl;
            pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "UPDATER_UPDATE_FAILED"));
            return;
        }

        
        if (!UpdateSpawner::SpawnAutoUpdater()) {
            std::cerr << "[Service] Failed to spawn AutoUpdater. Error: " << GetLastError() << std::endl;
            pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "SPAWN_FAILED"));
            return;
        }

        std::cout << "[Service] AutoUpdater spawned. Update process started." << std::endl;
    }
    else if (command == PipeProtocol::CMD_ACK_SHUTDOWN) {
        std::cout << "[Service] Agent acknowledged shutdown." << std::endl;
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

    if (!pipe.CreatePipe()) return;

    while (WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
        std::cout << "\n[Service] Waiting for agent..." << std::endl;

        int result = pipe.WaitForClient();

        if (result == 1) break;

        if (result == -1) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            continue;
        }

        std::cout << "[Service] Agent connected." << std::endl;


        bool active = true;
        while (active && WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
            std::string message = pipe.ReadMessage();

            if (message.empty()) {
                std::cout << "[Service] Agent disconnected." << std::endl;
                active = false;
                continue;
            }

            ProcessMessage(message, pipe);
        }

        pipe.DisconnectClient();
    }

    std::cout << "[Service] Stopping..." << std::endl;
    if (pipe.IsClientConnected()) {
        pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_SHUTDOWN));
    }
    pipe.Cleanup();
}



int wmain(int argc, wchar_t* argv[]) {
    if (argc > 1) {
        std::wstring arg = argv[1];
        if (arg == L"--install")   return ServiceManager::InstallService() ? 0 : 1;
        if (arg == L"--uninstall") return ServiceManager::UninstallService() ? 0 : 1;
        if (arg == L"--console")   { RunConsoleMode(); return 0; }

        std::wcout << L"Usage: FactoryService.exe [--install|--uninstall|--console]" << std::endl;
        return 1;
    }

    SERVICE_TABLE_ENTRYW table[] = {
        { (LPWSTR)PipeProtocol::SERVICE_NAME, ServiceMain },
        { NULL, NULL }
    };

    if (!StartServiceCtrlDispatcherW(table)) {
        std::cout << "[Service] Not started by SCM. Use --console." << std::endl;
        return 1;
    }

    return 0;
}
