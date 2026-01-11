#include <windows.h>
#include <shellapi.h>
#include <fstream>
#include "../include/core/AgentCore.h"
#include "../include/ui/TrayIcon.h"
#include "../include/ui/RegistrationDialog.h"
#include "../include/common/Constants.h"
#include "../include/common/Types.h"
#include "../include/utilities/NetworkUtils.h"
#include "../third_party/json/json.hpp"

// Link with Ws2_32.lib for networking
#pragma comment(lib, "Ws2_32.lib")

using json = nlohmann::json;

/*
 * main.cpp
 * Application entry point
 * Sets up window, tray icon, and starts agent
 */

AgentCore* g_agentCore = NULL;
TrayIcon* g_trayIcon = NULL;
HWND g_hwnd = NULL;
HMENU g_popupMenu = NULL;
bool g_exitRequested = false;

bool LoadSettings(AgentSettings& settings);
void SaveSettings(const AgentSettings& settings);
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

// Helper to detect IP safely
std::string DetectIPAddress() {
    std::string ip = "127.0.0.1";
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) == 0) {
        ip = NetworkUtils::GetIPAddress();
        WSACleanup();
    }
    return ip;
}

bool LoadSettings(AgentSettings& settings) {
    std::ifstream file(AgentConstants::CONFIG_FILE_NAME);
    if (!file.is_open()) {
        return false;
    }

    try {
        json config;
        file >> config;

        settings.pcId = config.value("pcId", 0);
        settings.lineNumber = config["lineNumber"];
        settings.pcNumber = config["pcNumber"];
        settings.configFilePath = config["configFilePath"];
        settings.logFolderPath = config["logFolderPath"];
        settings.modelFolderPath = config["modelFolderPath"];

        if (config.contains("ipAddress")) {
            settings.ipAddress = config["ipAddress"];
        }

        if (config.contains("modelVersion")) {
            settings.modelVersion = config["modelVersion"];
        }

        std::string serverUrlStr = config["serverUrl"];
        std::string exeNameStr = config["exeName"];
        settings.serverUrl = std::wstring(serverUrlStr.begin(), serverUrlStr.end());
        settings.exeName = std::wstring(exeNameStr.begin(), exeNameStr.end());

        return true;
    }
    catch (...) {
        return false;
    }
}

void SaveSettings(const AgentSettings& settings) {
    json config;
    config["pcId"] = settings.pcId;
    config["lineNumber"] = settings.lineNumber;
    config["pcNumber"] = settings.pcNumber;
    config["configFilePath"] = settings.configFilePath;
    config["logFolderPath"] = settings.logFolderPath;
    config["modelFolderPath"] = settings.modelFolderPath;

    if (!settings.ipAddress.empty()) {
        config["ipAddress"] = settings.ipAddress;
    }

    if (!settings.modelVersion.empty()) {
        config["modelVersion"] = settings.modelVersion;
    }

    std::string serverUrlStr(settings.serverUrl.begin(), settings.serverUrl.end());
    std::string exeNameStr(settings.exeName.begin(), settings.exeName.end());
    config["serverUrl"] = serverUrlStr;
    config["exeName"] = exeNameStr;

    std::ofstream file(AgentConstants::CONFIG_FILE_NAME);
    file << config.dump(4);
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_TRAYICON:
        if (lParam == WM_RBUTTONUP) {
            POINT pt;
            GetCursorPos(&pt);
            SetForegroundWindow(hwnd);
            TrackPopupMenu(g_popupMenu, TPM_BOTTOMALIGN | TPM_LEFTALIGN,
                pt.x, pt.y, 0, hwnd, NULL);
        }
        return 0;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case ID_TRAY_EXIT:
            g_exitRequested = true;
            if (g_agentCore) {
                g_agentCore->Stop();
            }
            PostQuitMessage(0);
            break;

        case ID_TRAY_STATUS:
        {
            if (!g_agentCore) {
                MessageBox(hwnd, L"Agent not initialized", L"Status",
                    MB_OK | MB_ICONWARNING);
                break;
            }

            AgentStatus status = g_agentCore->GetStatus();

            wchar_t buffer[512];
            swprintf_s(buffer, 512,
                L"Status: %s\n"
                L"PC ID: %d\n"
                L"Line Number: %d\n"
                L"Connection Failures: %d",
                status.isConnected ? L"Connected" : L"Disconnected",
                status.pcId,
                status.lineNumber,
                status.connectionFailures
            );

            MessageBox(hwnd, buffer, L"Agent Status",
                MB_OK | MB_ICONINFORMATION);
            break;
        }

        case ID_TRAY_RECONNECT:
            MessageBox(hwnd, L"Reconnecting...", L"Factory Agent", MB_OK | MB_ICONINFORMATION);
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
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }
    return 0;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {

    WNDCLASSEX wc;
    ZeroMemory(&wc, sizeof(WNDCLASSEX));
    wc.cbSize = sizeof(WNDCLASSEX);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = AgentConstants::WINDOW_CLASS_NAME;

    if (!RegisterClassEx(&wc)) {
        return 1;
    }

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

    // 1. Initialize settings structure
    AgentSettings settings;

    // 2. Pre-detect IP Address BEFORE doing anything else
    settings.ipAddress = DetectIPAddress();

    // 3. Try to load existing settings
    if (!LoadSettings(settings)) {

        // 4. First Run: Show Dialog
        // The 'settings' object already has the detected IP from step 2.
        if (!RegistrationDialog::ShowDialog(hInstance, settings)) {
            DestroyWindow(g_hwnd);
            return 0;
        }

        // 5. Save settings (including IP)
        SaveSettings(settings);
    }
    else {
        // Update IP on every run in case it changed
        settings.ipAddress = DetectIPAddress();
        SaveSettings(settings);
    }

    g_agentCore = new AgentCore();
    if (!g_agentCore->Initialize(settings)) {
        delete g_agentCore;
        DestroyWindow(g_hwnd);
        return 1;
    }

    g_trayIcon = new TrayIcon();
    g_trayIcon->Create(g_hwnd, true);

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
        delete g_agentCore;
    }

    if (g_trayIcon) {
        g_trayIcon->Remove();
        delete g_trayIcon;
    }

    DestroyWindow(g_hwnd);

    return 0;
}