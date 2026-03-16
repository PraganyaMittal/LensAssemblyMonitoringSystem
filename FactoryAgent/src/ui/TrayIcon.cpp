#include "ui/TrayIcon.h"
#include "common/Constants.h"
#include <windows.h>

TrayIcon::TrayIcon() {
    ZeroMemory(&nid_, sizeof(NOTIFYICONDATA));
    created_ = false;
}

TrayIcon::~TrayIcon() {
    Remove();
}

bool TrayIcon::Create(HWND hwnd, bool connected) {
    nid_.cbSize = sizeof(NOTIFYICONDATA);
    nid_.hWnd = hwnd;
    nid_.uID = 1;
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid_.uCallbackMessage = WM_TRAYICON;
    nid_.hIcon = LoadIcon(NULL, connected ? IDI_INFORMATION : IDI_WARNING);
    
    nid_.uVersion = NOTIFYICON_VERSION_4;

    const wchar_t* status = connected ?
        AgentConstants::TRAY_TITLE_CONNECTED :
        AgentConstants::TRAY_TITLE_DISCONNECTED;

    wcscpy_s(nid_.szTip, sizeof(nid_.szTip) / sizeof(wchar_t), status);

    created_ = (Shell_NotifyIcon(NIM_ADD, &nid_) != 0);
    if (created_) {
        Shell_NotifyIcon(NIM_SETVERSION, &nid_);
    }
    return created_;
}

void TrayIcon::Update(bool connected) {
    if (!created_) {
        return;
    }

    nid_.hIcon = LoadIcon(NULL, connected ? IDI_INFORMATION : IDI_WARNING);

    const wchar_t* status = connected ?
        AgentConstants::TRAY_TITLE_CONNECTED :
        AgentConstants::TRAY_TITLE_DISCONNECTED;

    wcscpy_s(nid_.szTip, sizeof(nid_.szTip) / sizeof(wchar_t), status);

    Shell_NotifyIcon(NIM_MODIFY, &nid_);
}

void TrayIcon::Remove() {
    if (created_ && nid_.hWnd) {
        Shell_NotifyIcon(NIM_DELETE, &nid_);
        nid_.hWnd = NULL;
        created_ = false;
    }
}

void TrayIcon::ShowBalloonNotification(const wchar_t* title, const wchar_t* message, DWORD infoFlags, UINT timeoutMs) {
    if (!created_) {
        return;
    }

    nid_.uFlags = NIF_INFO;
    nid_.dwInfoFlags = infoFlags;
    nid_.uTimeout = timeoutMs;

    wcscpy_s(nid_.szInfoTitle, sizeof(nid_.szInfoTitle) / sizeof(wchar_t), title);
    wcscpy_s(nid_.szInfo, sizeof(nid_.szInfo) / sizeof(wchar_t), message);

    Shell_NotifyIcon(NIM_MODIFY, &nid_);
    
    // Reset flags so future updates don't keep showing the balloon
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid_.szInfoTitle[0] = L'\0';
    nid_.szInfo[0] = L'\0';
}