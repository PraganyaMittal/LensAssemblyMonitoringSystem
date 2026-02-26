#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include "../Common/PipeProtocol.h"
#include "PipeHandler.h"
#include "ProcessManager.h"
#include "UpdateManager.h"
#include "ServiceManager.h"

// ============================================================
// Globals for Windows Service
// ============================================================
SERVICE_STATUS          g_ServiceStatus = {};
SERVICE_STATUS_HANDLE   g_StatusHandle = NULL;
HANDLE                  g_StopEvent = NULL;

// Forward declarations
void WINAPI ServiceMain(DWORD argc, LPWSTR* argv);
void WINAPI ServiceCtrlHandler(DWORD ctrlCode);
void RunServiceLogic();
void RunConsoleMode();
void ProcessClientMessage(const std::string& message, PipeHandler& pipe,
                          ProcessManager& procMgr, UpdateManager& updMgr,
                          bool& shouldDisconnect);


// ============================================================
// Entry Point
// ============================================================
int wmain(int argc, wchar_t* argv[]) {

    // Handle command-line arguments for service management
    if (argc > 1) {
        std::wstring arg = argv[1];

        if (arg == L"--install") {
            return ServiceManager::InstallService() ? 0 : 1;
        }
        if (arg == L"--uninstall") {
            return ServiceManager::UninstallService() ? 0 : 1;
        }
        if (arg == L"--console") {
            // Run in console mode for easier debugging
            std::cout << "[Server] Running in CONSOLE mode (not as service)" << std::endl;
            RunConsoleMode();
            return 0;
        }

        std::wcout << L"Usage:" << std::endl;
        std::wcout << L"  PipeServer.exe --install     Install as Windows Service" << std::endl;
        std::wcout << L"  PipeServer.exe --uninstall   Uninstall the Windows Service" << std::endl;
        std::wcout << L"  PipeServer.exe --console     Run in console mode (for testing)" << std::endl;
        return 1;
    }

    // No arguments — run as Windows Service
    SERVICE_TABLE_ENTRYW serviceTable[] = {
        { (LPWSTR)PipeProtocol::SERVICE_NAME, ServiceMain },
        { NULL, NULL }
    };

    if (!StartServiceCtrlDispatcherW(serviceTable)) {
        DWORD err = GetLastError();
        if (err == ERROR_FAILED_SERVICE_CONTROLLER_CONNECT) {
            // Not started by SCM — run in console mode as fallback
            std::cout << "[Server] Not started by SCM. Use --console for console mode." << std::endl;
            std::cout << "[Server] Or use --install to install as a Windows Service." << std::endl;
        } else {
            std::cerr << "[Server] StartServiceCtrlDispatcher failed. Error: " << err << std::endl;
        }
        return 1;
    }

    return 0;
}


// ============================================================
// Windows Service Entry Point (called by SCM)
// ============================================================
void WINAPI ServiceMain(DWORD argc, LPWSTR* argv) {
    g_StatusHandle = RegisterServiceCtrlHandlerW(PipeProtocol::SERVICE_NAME, ServiceCtrlHandler);
    if (!g_StatusHandle) return;

    // Report starting
    g_ServiceStatus.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_ServiceStatus.dwCurrentState = SERVICE_START_PENDING;
    g_ServiceStatus.dwControlsAccepted = 0;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    // Create stop event
    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!g_StopEvent) {
        g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
        g_ServiceStatus.dwWin32ExitCode = GetLastError();
        SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
        return;
    }

    // Report running
    g_ServiceStatus.dwCurrentState = SERVICE_RUNNING;
    g_ServiceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    // Run the main logic
    RunServiceLogic();

    // Clean up
    CloseHandle(g_StopEvent);

    g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
}


// ============================================================
// Service Control Handler (handles stop signals from SCM)
// ============================================================
void WINAPI ServiceCtrlHandler(DWORD ctrlCode) {
    switch (ctrlCode) {
        case SERVICE_CONTROL_STOP:
            g_ServiceStatus.dwCurrentState = SERVICE_STOP_PENDING;
            SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
            // Signal the main loop to stop
            SetEvent(g_StopEvent);
            break;

        case SERVICE_CONTROL_INTERROGATE:
            // Just report current status
            SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
            break;

        default:
            break;
    }
}


// ============================================================
// Console Mode — for testing without installing as a service
// ============================================================
void RunConsoleMode() {
    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    // Set up a Ctrl+C handler to signal stop
    SetConsoleCtrlHandler([](DWORD ctrlType) -> BOOL {
        if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT) {
            std::cout << "\n[Server] Ctrl+C received. Stopping..." << std::endl;
            SetEvent(g_StopEvent);
            return TRUE;
        }
        return FALSE;
    }, TRUE);

    RunServiceLogic();
    CloseHandle(g_StopEvent);
}


// ============================================================
// Main Service Logic (shared between service mode and console mode)
// ============================================================
void RunServiceLogic() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Factory Service (PipeServer)" << std::endl;
    std::cout << "========================================" << std::endl;

    PipeHandler pipe;
    ProcessManager procMgr;
    UpdateManager updMgr;

    // Initialize pipe handler (create events)
    if (!pipe.Initialize()) {
        std::cerr << "[Server] Failed to initialize pipe handler." << std::endl;
        return;
    }

    // Create the named pipe
    if (!pipe.CreatePipe()) {
        std::cerr << "[Server] Failed to create pipe." << std::endl;
        return;
    }

    // Ensure updates/ and backup/ directories exist
    updMgr.EnsureDirectories();

    // Service is passive — does NOT start the agent
    // Agent runs independently and connects to this pipe on its own

    // Main loop: accept client connections
    while (WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {

        std::cout << "\n[Server] Waiting for agent to connect..." << std::endl;

        if (!pipe.WaitForClient(g_StopEvent)) {
            // Stop event was signaled or error
            break;
        }

        std::cout << "[Server] Client connected!" << std::endl;

        // Message loop — read commands from client
        bool shouldDisconnect = false;
        while (!shouldDisconnect && WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {

            std::string message = pipe.ReadMessage(g_StopEvent);
            if (message.empty()) {
                // Agent disconnected on its own — just log and wait for reconnection
                std::cout << "[Server] Agent disconnected. Waiting for reconnection..." << std::endl;
                break;
            }

            std::cout << "[Server] Received: " << message << std::endl;
            ProcessClientMessage(message, pipe, procMgr, updMgr, shouldDisconnect);
        }

        // Disconnect pipe so it can accept a new connection
        pipe.DisconnectClient();
    }

    // Service is stopping
    std::cout << "[Server] Service stopping..." << std::endl;

    // Try to send SHUTDOWN to agent if connected (best-effort)
    pipe.WriteMessage(std::string(PipeProtocol::CMD_SHUTDOWN) + "|");

    pipe.Cleanup();
    std::cout << "[Server] Service stopped." << std::endl;
}


// ============================================================
// Process a single client message and send response
// ============================================================
void ProcessClientMessage(const std::string& message, PipeHandler& pipe,
                          ProcessManager& procMgr, UpdateManager& updMgr,
                          bool& shouldDisconnect) {

    std::string command = PipeProtocol::ParseCommand(message);
    std::string payload = PipeProtocol::ParsePayload(message);

    // --- PING ---
    if (command == PipeProtocol::CMD_PING) {
        std::string response = PipeProtocol::RESP_PONG;
        pipe.WriteMessage(response);
        std::cout << "[Server] Sent: " << response << std::endl;
    }
    // --- CHECK_UPDATE ---
    else if (command == PipeProtocol::CMD_CHECK_UPDATE) {
        std::cout << "[Server] Agent version: " << payload << std::endl;

        if (updMgr.IsUpdateAvailable()) {
            std::string response = PipeProtocol::MakeResponse("OK", "UPDATE_AVAILABLE|V2.0");
            pipe.WriteMessage(response);
            std::cout << "[Server] Sent: " << response << std::endl;
        } else {
            std::string response(PipeProtocol::RESP_NO_UPDATE);
            pipe.WriteMessage(response);
            std::cout << "[Server] Sent: " << response << std::endl;
        }
    }
    // --- GET_CONFIG ---
    else if (command == PipeProtocol::CMD_GET_CONFIG) {
        std::string response = PipeProtocol::MakeResponse("OK", "{\"interval\":30,\"logLevel\":\"INFO\"}");
        pipe.WriteMessage(response);
        std::cout << "[Server] Sent: " << response << std::endl;
    }
    // --- READY_TO_UPDATE ---
    else if (command == PipeProtocol::CMD_READY_TO_UPDATE) {
        std::cout << "[Server] Agent is ready for update. Starting update process..." << std::endl;

        // Step 1: Tell agent to shut down
        std::string shutdownCmd = std::string(PipeProtocol::CMD_SHUTDOWN) + "|";
        pipe.WriteMessage(shutdownCmd);
        std::cout << "[Server] Sent: " << shutdownCmd << std::endl;

        // Step 2: Wait for ACK_SHUTDOWN
        std::string ack = pipe.ReadMessage(g_StopEvent);
        std::cout << "[Server] Received: " << ack << std::endl;

        // Step 3: Wait briefly for agent to exit
        std::cout << "[Server] Waiting for agent to exit..." << std::endl;
        std::this_thread::sleep_for(std::chrono::seconds(2));

        // Step 4: Disconnect current pipe session
        shouldDisconnect = true;

        // Step 5: Perform the file replacement
        if (updMgr.PerformUpdate()) {
            std::cout << "[Server] Update complete! Restarting agent..." << std::endl;
        } else {
            std::cerr << "[Server] Update failed! Attempting rollback..." << std::endl;
            updMgr.Rollback();
        }

        // Step 6: Restart the agent (only time the service starts the agent)
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << "[Server] Restarting agent after update..." << std::endl;
        procMgr.StartAgent();
    }
    // --- ACK_SHUTDOWN ---
    else if (command == PipeProtocol::CMD_ACK_SHUTDOWN) {
        std::cout << "[Server] Agent acknowledged shutdown." << std::endl;
    }
    // --- Unknown ---
    else {
        std::string response = PipeProtocol::MakeResponse("ERROR", "UNKNOWN_COMMAND");
        pipe.WriteMessage(response);
        std::cout << "[Server] Sent: " << response << std::endl;
    }
}
