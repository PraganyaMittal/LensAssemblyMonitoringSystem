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
#include "ui/TrayIcon.h"
#include "ui/RegistrationDialog.h"
#include "common/Constants.h"
#include "common/Types.h"
#include "utilities/NetworkUtils.h"
#include "Utils/Logger.h"
#include "json/json.hpp"
#include "../resource.h"

// Custom window messages for async operations
#define WM_RECONNECT_DONE (WM_USER + 100)
#define WM_EXIT_READY     (WM_USER + 101)


#pragma comment(lib, "Ws2_32.lib")

using json = nlohmann::json;



#include <memory>

std::unique_ptr<AgentCore> g_agentCore = nullptr;
std::unique_ptr<TrayIcon> g_trayIcon = nullptr;
HWND g_hwnd = NULL;
HMENU g_popupMenu = NULL;
bool g_exitRequested = false;
UINT g_taskbarRestartMessage = 0;

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
            SetDlgItemTextA(hDlg, IDC_STATUS_MODELVERSION, settings.modelVersion.c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_SERVERURL, settings.serverUrl.c_str());
            SetDlgItemTextW(hDlg, IDC_STATUS_EXENAME, settings.exeName.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_IPADDRESS, settings.ipAddress.c_str());
            SetDlgItemTextA(hDlg, IDC_STATUS_INSTALLDIR, settings.installDir.c_str());
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

    // Async reconnect finished — re-enable menu and notify user
    case WM_RECONNECT_DONE:
        EnableMenuItem(g_popupMenu, ID_TRAY_RECONNECT, MF_ENABLED);
        Logger::Info("Reconnection completed.");
        if (g_trayIcon) {
            g_trayIcon->ShowBalloonNotification(L"Factory Agent", L"Reconnection completed successfully.", NIIF_INFO, 3000);
        }
        return 0;

    // Async exit shutdown finished — safe to quit now
    case WM_EXIT_READY:
        PostQuitMessage(0);
        return 0;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case ID_TRAY_EXIT:
            g_exitRequested = true;
            // Disable menu to prevent double-clicks
            EnableMenuItem(g_popupMenu, ID_TRAY_EXIT, MF_GRAYED);
            EnableMenuItem(g_popupMenu, ID_TRAY_RECONNECT, MF_GRAYED);
            // Run Stop() on background thread so the UI stays responsive
            std::thread([hwnd]() {
                if (g_agentCore) {
                    g_agentCore->Stop();
                }
                PostMessage(hwnd, WM_EXIT_READY, 0, 0);
            }).detach();
            break;

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
                // Disable menu to prevent double-clicks while reconnecting
                EnableMenuItem(g_popupMenu, ID_TRAY_RECONNECT, MF_GRAYED);
                
                // Show non-blocking popup to inform user
                if (g_trayIcon) {
                    g_trayIcon->ShowBalloonNotification(L"Factory Agent", L"Reconnection initiated...\nPlease wait.", NIIF_INFO, 2000);
                }

                // Run Stop()+Start() on background thread so UI stays responsive
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
        if (g_trayIcon) {
            g_trayIcon->Remove();
        }
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

// RAII guard for Win32 mutex handle (Issue 2 & 3)
struct MutexGuard {
    HANDLE h_;
    MutexGuard(HANDLE h) : h_(h) {}
    ~MutexGuard() { if (h_) { ReleaseMutex(h_); CloseHandle(h_); } }
    MutexGuard(const MutexGuard&) = delete;
    MutexGuard& operator=(const MutexGuard&) = delete;
};

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {

    HANDLE hMutex = NULL;
    int retryCount = 0;
    while (retryCount < 10) {
        hMutex = CreateMutex(NULL, TRUE, L"Global\\FactoryAgentSingleInstanceMutex");
        if (GetLastError() == ERROR_ALREADY_EXISTS) {
            CloseHandle(hMutex);
            hMutex = NULL;
            Sleep(500);
            retryCount++;
        } else {
            break;
        }
    }

    if (!hMutex) {
        MessageBoxA(NULL, "The Factory Agent is already running in the background.", "Agent Already Running", MB_OK | MB_ICONWARNING | MB_TOPMOST);
        return 0;
    }

    MutexGuard mutexGuard(hMutex); // RAII — auto-closes on any return path

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
    AppendMenu(g_popupMenu, MF_SEPARATOR, 0, NULL);
    AppendMenu(g_popupMenu, MF_STRING, ID_TRAY_EXIT, L"Exit");

    
    AgentSettings settings;

    
    settings.ipAddress = NetworkUtils::DetectIPAddress();

    
    if (!LoadSettings(settings)) {

        
        
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

    MSG msg;
    ZeroMemory(&msg, sizeof(MSG));

    while (!g_exitRequested) {
        if (GetMessage(&msg, NULL, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        else {
            break;
        }
    }

    if (g_agentCore) {
        g_agentCore->Stop();
        g_agentCore.reset();
    }

    if (g_trayIcon) {
        g_trayIcon->Remove();
        g_trayIcon.reset();
    }

    // Issue 1: Destroy GDI menu handle to prevent leak
    if (g_popupMenu) {
        DestroyMenu(g_popupMenu);
        g_popupMenu = NULL;
    }

    DestroyWindow(g_hwnd);

    return 0;
}