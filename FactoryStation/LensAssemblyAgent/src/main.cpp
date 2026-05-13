#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#ifndef NTDDI_VERSION
#define NTDDI_VERSION 0x0A000000
#endif

#include <sdkddkver.h>
#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
#include <fstream>
#include <thread>
#include "core/AgentCore.h"
#include "ExeNames.h"
#include "ui/TrayIcon.h"
#include "ui/RegistrationDialog.h"
#include "common/Constants.h"
#include "common/Types.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include "json/json.hpp"
#include "../resource.h"

#include "utilities/CrashDumper.h"

#define WM_RECONNECT_DONE (WM_USER + 100)
#define WM_EXIT_READY     (WM_USER + 101)

#pragma comment(lib, "Ws2_32.lib")

using json = nlohmann::json;

#include <memory>
#include <mutex>

std::unique_ptr<AgentCore> g_agentCore = nullptr;
std::unique_ptr<TrayIcon> g_trayIcon = nullptr;
HWND g_hwnd = NULL;
HMENU g_popupMenu = NULL;
bool g_exitRequested = false;
UINT g_taskbarRestartMessage = 0;
std::once_flag g_stopOnce;
HANDLE g_gracefulStopEvent = NULL;

bool LoadSettings(AgentSettings& settings);
void SaveSettings(const AgentSettings& settings);
INT_PTR CALLBACK StatusDialogProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam);
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);


bool LoadSettings(AgentSettings& settings) {
    std::ifstream file(AgentConstants::CONFIG_FILE_NAME);
    if (!file.is_open()) {
        return false;
    }

    try {
        json config;
        file >> config;

        settings.mcId = config.value("mcId", 0);
        
        if (config.contains("serverUrl")) {
            std::string serverUrlStr = config["serverUrl"];
            settings.serverUrl = NetworkUtils::ConvertStringToWString(serverUrlStr);
        }
        
        if (config.contains("exeName")) {
            std::string exeNameStr = config["exeName"];
            settings.exeName = NetworkUtils::ConvertStringToWString(exeNameStr);
        }

        return true;
    }
    catch (...) {
        return false;
    }
}

void SaveSettings(const AgentSettings& settings) {
    json config;
    config["mcId"] = settings.mcId;

    std::string serverUrlStr = NetworkUtils::ConvertWStringToString(settings.serverUrl);
    std::string exeNameStr = NetworkUtils::ConvertWStringToString(settings.exeName);
    
    config["serverUrl"] = serverUrlStr;
    config["exeName"] = exeNameStr;

    std::ofstream file(AgentConstants::CONFIG_FILE_NAME);
    file << config.dump(4);
}

INT_PTR CALLBACK StatusDialogProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_INITDIALOG:
    {
        if (g_agentCore) {
            AgentStatus status = g_agentCore->GetStatus();
            AgentSettings settings = g_agentCore->GetSettings();

            SetDlgItemTextW(hDlg, IDC_STATUS_CONNECTED, status.isConnected ? L"Connected" : L"Disconnected");
            SetDlgItemTextW(hDlg, IDC_STATUS_FAILURES, std::to_wstring(status.connectionFailures).c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_MCID, std::to_wstring(settings.mcId).c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_LINENUM, std::to_wstring(settings.lineNumber).c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_MCNUM, std::to_wstring(settings.mcNumber).c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_CONFIGPATH, settings.configFilePath.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_LOGPATH, settings.logFolderPath.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_MODELPATH, settings.modelFolderPath.c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_YIELDPATH, settings.yieldMonitorPath.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_GENERATIONNO, settings.generationNo.c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_SERVERURL, settings.serverUrl.c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_EXENAME, settings.exeName.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_IPADDRESS, settings.ipAddress.c_str());
        }
        return (INT_PTR)TRUE;
    }
    case WM_COMMAND:
        if (LOWORD(wParam) == IDOK || LOWORD(wParam) == IDCANCEL) {
            EndDialog(hDlg, LOWORD(wParam));
            return (INT_PTR)TRUE;
        }
        break;
    }
    return (INT_PTR)FALSE;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_TRAYICON:
        if (LOWORD(lParam) == WM_CONTEXTMENU || LOWORD(lParam) == WM_RBUTTONUP) {
            POINT pt;
            GetCursorPos(&pt);
            SetForegroundWindow(hwnd);
            TrackPopupMenu(g_popupMenu, TPM_BOTTOMALIGN | TPM_LEFTALIGN,
                pt.x, pt.y, 0, hwnd, NULL);
        }
        return 0;

    case WM_TIMER:
        if (wParam == 1) {
            if (g_agentCore && g_trayIcon) {
                bool isConnected = g_agentCore->GetStatus().isConnected;
                g_trayIcon->Update(isConnected);
            }
        }
        return 0;

    case WM_RECONNECT_DONE:
        EnableMenuItem(g_popupMenu, ID_TRAY_RECONNECT, MF_ENABLED);
        Logger::Info("Reconnection completed.");
        if (g_trayIcon) {
            g_trayIcon->ShowBalloonNotification(L"Factory Agent", L"Reconnection completed successfully.", NIIF_INFO, 3000);
        }
        return 0;

    case WM_EXIT_READY:
        PostQuitMessage(0);
        return 0;

    case WM_CLOSE:
        std::thread([hwnd]() {
            std::call_once(g_stopOnce, [&]() {
                if (g_agentCore) {
                    g_agentCore->Stop();
                }
            });
            PostMessage(hwnd, WM_EXIT_READY, 0, 0);
        }).detach();
        return 0;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {

        case ID_TRAY_STATUS:
        {
            if (!g_agentCore) {
                if (g_trayIcon) g_trayIcon->ShowBalloonNotification(L"Status", L"Agent not initialized", NIIF_WARNING);
                break;
            }

            DialogBox(GetModuleHandle(NULL), MAKEINTRESOURCE(IDD_STATUS), hwnd, StatusDialogProc);
            break;
        }

        case ID_TRAY_RECONNECT:
            if (g_agentCore) {
                EnableMenuItem(g_popupMenu, ID_TRAY_RECONNECT, MF_GRAYED);
                
                
                if (g_trayIcon) {
                    g_trayIcon->ShowBalloonNotification(L"Factory Agent", L"Reconnection initiated...\nPlease wait.", NIIF_INFO, 2000);
                }

                std::thread([hwnd]() {
                    Logger::Info("Reconnect requested — stopping agent...");
                    g_agentCore->Stop();
                    Sleep(300);

                    AgentSettings tempSettings;
                    if (LoadSettings(tempSettings)) {
                        tempSettings.ipAddress = NetworkUtils::DetectIPAddress();
                        SaveSettings(tempSettings);
                        g_agentCore->ReloadSettings(tempSettings);
                    }

                    Logger::Info("Reconnect — starting agent...");
                    g_agentCore->Start();
                    PostMessage(hwnd, WM_RECONNECT_DONE, 0, 0);
                }).detach();
            } else {
                if (g_trayIcon) g_trayIcon->ShowBalloonNotification(L"Factory Agent", L"Agent not initialized.", NIIF_WARNING);
            }
            break;
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;

    default:
        if (msg == g_taskbarRestartMessage && g_taskbarRestartMessage != 0) {
            if (g_trayIcon) {
                bool isConnected = g_agentCore ? g_agentCore->GetStatus().isConnected : false;
                g_trayIcon->Create(g_hwnd, isConnected);
            }
            return 0;
        }
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }
    return 0;
}

struct MutexGuard {
    HANDLE h_;
    MutexGuard(HANDLE h) : h_(h) {}
    ~MutexGuard() { if (h_) { ReleaseMutex(h_); CloseHandle(h_); } }
    MutexGuard(const MutexGuard&) = delete;
    MutexGuard& operator=(const MutexGuard&) = delete;
};

int WINAPI WinMain(_In_ HINSTANCE hInstance, _In_opt_ HINSTANCE hPrevInstance, _In_ LPSTR lpCmdLine, _In_ int nCmdShow) {

    HANDLE hMutex = NULL;
    int retryCount = 0;
    while (retryCount < 10) {
        hMutex = CreateMutex(NULL, TRUE, L"Local\\LensAssemblyAgentSingleInstanceMutex");
        if (GetLastError() == ERROR_ALREADY_EXISTS) {
            if (hMutex) {
                CloseHandle(hMutex);
                hMutex = NULL;
            }
            Sleep(500);
            retryCount++;
        } else {
            break;
        }
    }

    if (!hMutex) {
        // Non-blocking: log and exit. 
        // We now show a message box so the user is aware.
        Logger::Initialize(AgentConstants::DEFAULT_INSTALL_DIR);
        Logger::Warning("Agent already running (mutex held). Exiting duplicate instance.");
        MessageBoxW(NULL, L"The Factory Agent is already running.", L"Factory Agent", MB_OK | MB_ICONWARNING);
        Logger::Shutdown();
        return 0;
    }

    MutexGuard mutexGuard(hMutex); 

    Logger::Initialize(AgentConstants::DEFAULT_INSTALL_DIR);
    
    SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS);
    
    std::string crashesDir = std::string(AgentConstants::DEFAULT_INSTALL_DIR) + "crashes";
    CrashDumper::Install(crashesDir);

    WNDCLASSEX wc;
    ZeroMemory(&wc, sizeof(WNDCLASSEX));
    wc.cbSize = sizeof(WNDCLASSEX);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = AgentConstants::WINDOW_CLASS_NAME;

    if (!RegisterClassEx(&wc)) {
        return 1;
    }

    g_taskbarRestartMessage = RegisterWindowMessage(L"TaskbarCreated");

    g_hwnd = CreateWindowEx(0, AgentConstants::WINDOW_CLASS_NAME,
        AgentConstants::WINDOW_TITLE, 0,
        0, 0, 1, 1, NULL, NULL, hInstance, NULL);

    if (!g_hwnd) {
        return 1;
    }

    g_popupMenu = CreatePopupMenu();
    AppendMenu(g_popupMenu, MF_STRING, ID_TRAY_STATUS, L"Status");
    AppendMenu(g_popupMenu, MF_STRING, ID_TRAY_RECONNECT, L"Reconnect");
    
    AgentSettings settings;

    settings.ipAddress = NetworkUtils::DetectIPAddress();
    
    if (!LoadSettings(settings) || settings.mcId == 0) {
        if (!RegistrationDialog::ShowDialog(hInstance, settings)) {
            DestroyWindow(g_hwnd);
            return 0;
        }
        SaveSettings(settings);
    }
    else {
        settings.ipAddress = NetworkUtils::DetectIPAddress();
        SaveSettings(settings);
    }

    g_agentCore = std::make_unique<AgentCore>();
    if (!g_agentCore->Initialize(settings)) {
        g_agentCore.reset();
        DestroyWindow(g_hwnd);
        return 1;
    }

    g_trayIcon = std::make_unique<TrayIcon>();
    g_trayIcon->Create(g_hwnd, true);

    SetTimer(g_hwnd, 1, 5000, NULL);

    Logger::Info("Agent initialized and starting...");

    g_agentCore->Start();

    // --- Global Named Event: unified graceful stop mechanism ---
    g_gracefulStopEvent = CreateEventW(NULL, TRUE, FALSE, GLOBAL_AGENT_STOP_EVENT);
    if (g_gracefulStopEvent) {
        std::thread([hwnd = g_hwnd]() {
            WaitForSingleObject(g_gracefulStopEvent, INFINITE);
            Logger::Info("Global stop event triggered. Shutting down gracefully...");
            std::call_once(g_stopOnce, [&]() {
                if (g_agentCore) g_agentCore->Stop();
            });
            PostMessage(hwnd, WM_EXIT_READY, 0, 0);
        }).detach();
    }

    // --- Service-Agent dependency: exit if Service stops ---
    // Dedicated thread uses NotifyServiceStatusChangeW with alertable wait.
    // APC fires on this thread only — main message loop stays untouched.
    std::thread([]() {
        SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
        if (!hSCM) return;
        SC_HANDLE hSvc = OpenServiceW(hSCM, SERVICE_SCM_NAME_W, SERVICE_QUERY_STATUS);
        if (!hSvc) { CloseServiceHandle(hSCM); return; }

        SERVICE_NOTIFYW notify = {};
        notify.dwVersion = SERVICE_NOTIFY_STATUS_CHANGE;
        notify.pfnNotifyCallback = [](PVOID pParam) {
            SERVICE_NOTIFYW* pNotify = (SERVICE_NOTIFYW*)pParam;
            if (pNotify->ServiceStatus.dwCurrentState == SERVICE_STOPPED ||
                pNotify->ServiceStatus.dwCurrentState == SERVICE_STOP_PENDING) {
                Logger::Info("Service stopped. Agent following suit...");
                if (g_gracefulStopEvent) SetEvent(g_gracefulStopEvent);
            }
        };

        DWORD err = NotifyServiceStatusChangeW(hSvc, SERVICE_NOTIFY_STOPPED, &notify);
        if (err == ERROR_SUCCESS) {
            // Alertable wait — APC fires here when service stops
            while (!g_exitRequested) {
                SleepEx(INFINITE, TRUE);  // Returns on APC delivery
            }
        }

        CloseServiceHandle(hSvc);
        CloseServiceHandle(hSCM);
    }).detach();

    MSG msg;
    ZeroMemory(&msg, sizeof(MSG));

    while (GetMessage(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    std::call_once(g_stopOnce, [&]() {
        if (g_agentCore) {
            g_agentCore->Stop();
        }
    });

    if (g_agentCore) {
        g_agentCore.reset();
    }

    if (g_trayIcon) {
        g_trayIcon->Remove();
        g_trayIcon.reset();
    }

    if (g_popupMenu) {
        DestroyMenu(g_popupMenu);
        g_popupMenu = NULL;
    }

    if (g_gracefulStopEvent) { CloseHandle(g_gracefulStopEvent); g_gracefulStopEvent = NULL; }

    DestroyWindow(g_hwnd);

    Logger::Shutdown();

    return 0;
}