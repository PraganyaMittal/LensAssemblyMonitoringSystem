#include "pch.h"
#include "../../Common/PipeProtocol.h"
#include "PipeHandler.h"
#include "UpdateSpawner.h"
#include "ServiceManager.h"
#include "ServiceLogger.h"

SERVICE_STATUS        g_ServiceStatus = {};
SERVICE_STATUS_HANDLE g_StatusHandle  = NULL;
HANDLE                g_StopEvent     = NULL;
HANDLE                g_ServiceThread = NULL;

void RunServiceLogic();

static std::wstring AtoW(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), nullptr, 0);
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), &result[0], size);
    return result;
}

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
    ServiceLogger::Init();
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
    ServiceLogger::Init();
    g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    DuplicateHandle(
        GetCurrentProcess(), GetCurrentThread(),
        GetCurrentProcess(), &g_ServiceThread,
        0, FALSE, DUPLICATE_SAME_ACCESS
    );

    SetConsoleCtrlHandler([](DWORD ctrlType) -> BOOL {
        if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT) {
            PIPE_LOG_INFO("\n[Service] Ctrl+C. Stopping...");
            SetEvent(g_StopEvent);
            if (g_ServiceThread) {
                CancelSynchronousIo(g_ServiceThread);
            }
            return TRUE;
        }
        return FALSE;
    }, TRUE);

    RunServiceLogic();

    if (g_StopEvent) { CloseHandle(g_StopEvent); g_StopEvent = NULL; }
    if (g_ServiceThread) { CloseHandle(g_ServiceThread); g_ServiceThread = NULL; }
}

void ProcessMessage(const std::string& message, PipeHandler& pipe) {
    std::string command = PipeProtocol::ParseCommand(message);
    std::string payload = PipeProtocol::ParsePayload(message);

    if (command == PipeProtocol::CMD_NOTIFY_UPDATE) {
        PIPE_LOG_INFO("[Service] Received NOTIFY_UPDATE from Agent.");
        
        std::string installDirStr = PipeProtocol::ExtractJsonValue(payload, "installDir");
        if (installDirStr.empty()) {
            PIPE_LOG_ERROR("[Service] NOTIFY_UPDATE missing installDir! Aborting.");
            pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "MISSING_BASE_DIR"));
            return;
        }
        std::wstring baseDir = AtoW(installDirStr);

        std::string type = PipeProtocol::ExtractJsonValue(payload, "type");
        bool skipBackup = (type == "RollbackLAI" || type == "RollbackBundle");
        
        std::wstring updateTypeStr = L"bundle";
        if (type == "UpdateLAI" || type == "DeployLAI" || type == "RollbackLAI") {
            updateTypeStr = L"lai";
        } else if (type == "UpdateBundle" || type == "DeployBundle" || type == "RollbackBundle") {
            updateTypeStr = L"bundle";
        }

        if (pipe.IsClientConnected()) {
            pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_UPDATE_NOW));

            bool gotAck = false;
            for (int i = 0; i < 10 && pipe.IsClientConnected(); i++) {
                std::string msg = pipe.ReadMessageWithTimeout(2000);
                if (msg.empty()) continue;

                if (PipeProtocol::ParseCommand(msg) == PipeProtocol::CMD_ACK_SHUTDOWN) {
                    PIPE_LOG_INFO("[Service] Agent acknowledged shutdown.");
                    gotAck = true;
                    break;
                }
            }
            if (!gotAck) {
                PIPE_LOG_INFO("[Service] No ACK received. Proceeding anyway.");
            }
        }

        if (!UpdateSpawner::UpdateUpdaterExe(baseDir)) {
            PIPE_LOG_ERROR("[Service] Failed to update AutoUpdater.exe. Aborting.");
            pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "UPDATER_UPDATE_FAILED"));
            return;
        }

        if (!UpdateSpawner::SpawnAutoUpdater(baseDir, g_StopEvent, skipBackup, updateTypeStr)) {
            PIPE_LOG_ERROR("[Service] Failed to spawn AutoUpdater. Error: " << GetLastError());
            pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "SPAWN_FAILED"));
            return;
        }

        PIPE_LOG_INFO("[Service] AutoUpdater spawned. Update process started.");
    }
    else if (command == PipeProtocol::CMD_ACK_SHUTDOWN) {
        PIPE_LOG_INFO("[Service] Agent acknowledged shutdown.");
    }
    else {
        pipe.WriteMessage(PipeProtocol::MakeResponse("ERROR", "UNKNOWN_COMMAND"));
    }
}

void RunServiceLogic() {
    PIPE_LOG_INFO("========================================");
    PIPE_LOG_INFO("  Factory Update Service");
    PIPE_LOG_INFO("========================================");

    PipeHandler pipe;

    if (!pipe.CreatePipe()) return;

    while (WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
        PIPE_LOG_INFO("\n[Service] Waiting for agent...");

        int result = pipe.WaitForClient();

        if (result == 1) break;

        if (result == -1) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            continue;
        }

        PIPE_LOG_INFO("[Service] Agent connected.");

        bool active = true;
        while (active && WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
            std::string message = pipe.ReadMessage();

            if (message.empty()) {
                PIPE_LOG_INFO("[Service] Agent disconnected.");
                active = false;
                continue;
            }

            ProcessMessage(message, pipe);
        }

        pipe.DisconnectClient();
    }

    PIPE_LOG_INFO("[Service] Stopping...");
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

        PIPE_LOG_INFO("Usage: FactoryService.exe [--install|--uninstall|--console]");
        return 1;
    }

    SERVICE_TABLE_ENTRYW table[] = {
        { (LPWSTR)PipeProtocol::SERVICE_NAME, ServiceMain },
        { NULL, NULL }
    };

    if (!StartServiceCtrlDispatcherW(table)) {
        PIPE_LOG_INFO("[Service] Not started by SCM. Use --console.");
        return 1;
    }

    return 0;
}
