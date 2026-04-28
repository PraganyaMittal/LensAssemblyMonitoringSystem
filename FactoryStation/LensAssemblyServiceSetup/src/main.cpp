#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif

#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <commctrl.h>
#pragma comment(lib, "comctl32.lib")
#pragma comment(linker, "\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
#include <string>
#include <filesystem>
#include <fstream>
#include <vector>
#include "../resource.h"
#include "ExeNames.h"

namespace fs = std::filesystem;

// ── Globals ──
static HWND g_hDlg = NULL;

// ── Helpers ──
static void SetStatus(const wchar_t* msg) {
    HWND hEdit = GetDlgItem(g_hDlg, IDC_STATUS_TEXT);
    int len = GetWindowTextLengthW(hEdit);
    SendMessageW(hEdit, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    std::wstring toAppend = msg;
    if (len > 0) toAppend = L"\r\n" + toAppend;
    SendMessageW(hEdit, EM_REPLACESEL, FALSE, (LPARAM)toAppend.c_str());
}

static void SetStatusA(const char* msg) {
    int size = MultiByteToWideChar(CP_UTF8, 0, msg, -1, NULL, 0);
    std::wstring wmsg(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, msg, -1, &wmsg[0], size);
    SetStatus(wmsg.c_str());
}

static void ClearStatus() {
    SetDlgItemTextW(g_hDlg, IDC_STATUS_TEXT, L"");
}

static std::wstring GetDlgText(int id) {
    wchar_t buf[1024] = {};
    GetDlgItemTextW(g_hDlg, id, buf, _countof(buf));
    return buf;
}

static bool IsServiceInstalled(const std::wstring& serviceName) {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
    if (!hSCM) return false;
    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(), SERVICE_QUERY_STATUS);
    bool installed = (hService != NULL);
    if (hService) CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return installed;
}

static void UpdateInstallButtonState() {
    std::wstring serviceName = GetDlgText(IDC_SERVICE_NAME);
    bool installed = IsServiceInstalled(serviceName);
    EnableWindow(GetDlgItem(g_hDlg, IDB_INSTALL), !installed);
    if (installed) {
        SetStatus(L"Service is already installed.");
    }
}



static std::wstring GetExeDirectory() {
    wchar_t path[MAX_PATH];
    GetModuleFileNameW(NULL, path, MAX_PATH);
    return fs::path(path).parent_path().wstring();
}

// ── Step 1: Create Directory Tree ──
static bool CreateDirectoryTree(const std::wstring& baseDir) {
    std::wstring base = baseDir;
    if (!base.empty() && base.back() != L'\\') base += L'\\';

    const std::wstring dirs[] = {
        base + L"Bundle\\",
        base + L"LAI\\",
        base + L"config\\",
        base + L"logs\\",
        base + L"crashes\\",
        base + L"update\\",
        base + L"update\\Bundle\\",
        base + L"update\\LAI\\",
        base + L"backup\\",
        base + L"backup\\Bundle\\",
        base + L"backup\\LAI\\"
    };

    for (const auto& dir : dirs) {
        try {
            fs::create_directories(dir);
        } catch (const std::exception& ex) {
            std::string msg = "Failed to create: " + std::string(ex.what());
            SetStatusA(msg.c_str());
            return false;
        }
    }
    return true;
}

// ── Step 2: Copy Executables ──
static bool CopyExecutables(const std::wstring& srcDir, const std::wstring& baseDir) {
    std::wstring bundleDir = baseDir;
    if (!bundleDir.empty() && bundleDir.back() != L'\\') bundleDir += L'\\';
    bundleDir += L"Bundle\\";

    const wchar_t* exeNames[] = {
        EXE_NAME_SERVICE_W,
        EXE_NAME_AGENT_W,
        EXE_NAME_UPDATER_W
    };

    for (const auto& name : exeNames) {
        std::wstring src = srcDir + L"\\" + name;
        std::wstring dst = bundleDir + name;

        if (!fs::exists(src)) {
            std::wstring msg = std::wstring(L"Not found: ") + name + L"\nSkipping (place it manually later).";
            SetStatus(msg.c_str());
            // Not fatal — user may not have all exes yet
            continue;
        }

        std::error_code ec;
        if (fs::exists(dst) && fs::equivalent(src, dst, ec)) {
            continue;
        }

        try {
            fs::copy_file(src, dst, fs::copy_options::overwrite_existing);
        } catch (const std::exception& ex) {
            std::string errStr = ex.what();
            std::wstring wMsg = std::wstring(L"Copy failed for ") + name + L":\r\n" + std::wstring(errStr.begin(), errStr.end());
            SetStatus(wMsg.c_str());
            return false;
        }
    }
    return true;
}

// ── Step 3: Write service_config.json ──
static bool WriteConfigFile(const std::wstring& baseDir, const std::wstring& serverUrl) {
    std::wstring configPath = baseDir;
    if (!configPath.empty() && configPath.back() != L'\\') configPath += L'\\';
    configPath += L"config\\service_config.json";

    // Convert serverUrl to UTF-8
    int size = WideCharToMultiByte(CP_UTF8, 0, serverUrl.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string serverUrlUtf8(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, serverUrl.c_str(), -1, &serverUrlUtf8[0], size, nullptr, nullptr);

    std::ofstream file(configPath);
    if (!file.is_open()) {
        SetStatus(L"Failed to write service_config.json");
        return false;
    }

    file << "{\n";
    file << "    \"serverUrl\": \"" << serverUrlUtf8 << "\",\n";
    file << "    \"agentExe\": \"" << EXE_NAME_AGENT << "\",\n";
    file << "    \"serviceExe\": \"" << EXE_NAME_SERVICE << "\",\n";
    file << "    \"laiExe\": \"" << EXE_NAME_LAI << "\",\n";
    file << "    \"updaterExe\": \"" << EXE_NAME_UPDATER << "\"\n";
    file << "}\n";
    file.close();
    return true;
}

// ── Step 3b: Write log_config.json ──
static bool WriteLogConfigFile(const std::wstring& baseDir) {
    std::wstring configPath = baseDir;
    if (!configPath.empty() && configPath.back() != L'\\') configPath += L'\\';
    configPath += L"config\\log_config.json";

    // Don't overwrite if already exists (preserve user customizations)
    if (fs::exists(configPath)) {
        SetStatus(L"log_config.json already exists. Keeping existing configuration.");
        return true;
    }

    std::ofstream file(configPath);
    if (!file.is_open()) {
        SetStatus(L"Failed to write log_config.json");
        return false;
    }

    file << "{\n";
    file << "    \"agent\": {\n";
    file << "        \"root_folder\": \"logs\\\\agent\",\n";
    file << "        \"file_name_format\": \"YYYYMMDDHHMM_agent.log\",\n";
    file << "        \"separator\": \"\\t\",\n";
    file << "        \"rotation_interval_minutes\": 10,\n";
    file << "        \"retention_days\": 7,\n";
    file << "        \"columns\": [\n";
    file << "            { \"name\": \"Datetime\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Level\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Module\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Message\", \"type\": \"string\" }\n";
    file << "        ]\n";
    file << "    },\n";
    file << "    \"service\": {\n";
    file << "        \"root_folder\": \"logs\\\\service\",\n";
    file << "        \"file_name_format\": \"YYYYMMDDHHMM_service.log\",\n";
    file << "        \"separator\": \"\\t\",\n";
    file << "        \"rotation_interval_minutes\": 60,\n";
    file << "        \"retention_days\": 15,\n";
    file << "        \"columns\": [\n";
    file << "            { \"name\": \"Datetime\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Level\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Module\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Message\", \"type\": \"string\" }\n";
    file << "        ]\n";
    file << "    },\n";
    file << "    \"autoupdater\": {\n";
    file << "        \"root_folder\": \"logs\\\\autoupdater\",\n";
    file << "        \"file_name_format\": \"YYYYMMDDHHMM_autoupdater.log\",\n";
    file << "        \"separator\": \"\\t\",\n";
    file << "        \"rotation_interval_minutes\": 1440,\n";
    file << "        \"retention_days\": 30,\n";
    file << "        \"columns\": [\n";
    file << "            { \"name\": \"Datetime\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Level\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"State\", \"type\": \"string\" },\n";
    file << "            { \"name\": \"Message\", \"type\": \"string\" }\n";
    file << "        ]\n";
    file << "    }\n";
    file << "}\n";
    file.close();
    return true;
}

// ── Step 4: Register Windows Service ──
static bool RegisterService(const std::wstring& baseDir, const std::wstring& serviceName) {
    std::wstring exePath = baseDir;
    if (!exePath.empty() && exePath.back() != L'\\') exePath += L'\\';
    exePath += L"Bundle\\" EXE_NAME_SERVICE_W;

    if (!fs::exists(exePath)) {
        SetStatus(L"Service exe not found in Bundle folder.");
        return false;
    }

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CREATE_SERVICE);
    if (!hSCM) {
        SetStatus(L"Failed to open Service Control Manager. Run as Administrator.");
        return false;
    }

    std::wstring quotedPath = L"\"" + exePath + L"\"";

    SC_HANDLE hService = CreateServiceW(
        hSCM,
        serviceName.c_str(),                   // Service name (internal)
        (serviceName + L" Service").c_str(),    // Display name
        SERVICE_ALL_ACCESS,
        SERVICE_WIN32_OWN_PROCESS,
        SERVICE_AUTO_START,                     // Start automatically on boot
        SERVICE_ERROR_NORMAL,
        quotedPath.c_str(),
        NULL, NULL, NULL,
        L"LocalSystem",                         // Run as SYSTEM
        NULL
    );

    if (!hService) {
        DWORD err = GetLastError();
        if (err == ERROR_SERVICE_EXISTS) {
            SetStatus(L"Service already registered. Updating...");
            hService = OpenServiceW(hSCM, serviceName.c_str(), SERVICE_ALL_ACCESS);
            if (!hService) {
                SetStatus(L"Failed to open existing service for update.");
                CloseServiceHandle(hSCM);
                return false;
            }
            ChangeServiceConfigW(hService, SERVICE_WIN32_OWN_PROCESS,
                SERVICE_AUTO_START, SERVICE_ERROR_NORMAL,
                quotedPath.c_str(), NULL, NULL, NULL,
                L"LocalSystem", NULL,
                (serviceName + L" Service").c_str());
        } else {
            SetStatus(L"Failed to create service.");
            CloseServiceHandle(hSCM);
            return false;
        }
    }

    // Configure auto-restart on failure
    SERVICE_FAILURE_ACTIONS_FLAG flag = { TRUE };
    ChangeServiceConfig2W(hService, SERVICE_CONFIG_FAILURE_ACTIONS_FLAG, &flag);

    SC_ACTION actions[3] = {
        { SC_ACTION_RESTART, 5000 },   // Restart after 5 sec
        { SC_ACTION_RESTART, 5000 },
        { SC_ACTION_RESTART, 5000 }
    };
    SERVICE_FAILURE_ACTIONSW failActions = {};
    failActions.dwResetPeriod = 86400;  // Reset failure count after 24h
    failActions.cActions = 3;
    failActions.lpsaActions = actions;
    ChangeServiceConfig2W(hService, SERVICE_CONFIG_FAILURE_ACTIONS, &failActions);

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return true;
}

// ── Step 5: Start Service ──
static bool StartInstalledService(const std::wstring& serviceName) {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
    if (!hSCM) return false;

    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(), SERVICE_START | SERVICE_QUERY_STATUS);
    if (!hService) {
        CloseServiceHandle(hSCM);
        return false;
    }

    if (!StartServiceW(hService, 0, NULL)) {
        DWORD err = GetLastError();
        CloseServiceHandle(hService);
        CloseServiceHandle(hSCM);
        // Already running is OK
        return (err == ERROR_SERVICE_ALREADY_RUNNING);
    }

    // Wait for it to start (up to 15 seconds)
    SERVICE_STATUS status = {};
    for (int i = 0; i < 30; i++) {
        (void)QueryServiceStatus(hService, &status);
        if (status.dwCurrentState == SERVICE_RUNNING) break;
        Sleep(500);
    }

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return (status.dwCurrentState == SERVICE_RUNNING);
}

// ── Uninstall ──
static bool UninstallService(const std::wstring& serviceName) {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) {
        SetStatus(L"Failed to open Service Control Manager.");
        return false;
    }

    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(), SERVICE_STOP | DELETE | SERVICE_QUERY_STATUS);
    if (!hService) {
        DWORD err = GetLastError();
        CloseServiceHandle(hSCM);
        if (err == ERROR_SERVICE_DOES_NOT_EXIST) {
            SetStatus(L"Service is not installed.");
            return false;
        }
        SetStatus(L"Failed to open service.");
        return false;
    }

    // Stop the service first
    SERVICE_STATUS status = {};
    ControlService(hService, SERVICE_CONTROL_STOP, &status);

    // Wait for stop (up to 10 seconds)
    for (int i = 0; i < 20; i++) {
        (void)QueryServiceStatus(hService, &status);
        if (status.dwCurrentState == SERVICE_STOPPED) break;
        Sleep(500);
    }

    BOOL deleted = DeleteService(hService);
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);

    if (deleted) {
        SetStatus(L"Service uninstalled successfully.");
        return true;
    } else {
        SetStatus(L"Failed to delete service.");
        return false;
    }
}

// ── Install Handler ──
static void DoInstall() {
    ClearStatus();
    std::wstring installDir  = GetDlgText(IDC_INSTALL_DIR);
    std::wstring serverUrl   = GetDlgText(IDC_SERVER_URL);
    std::wstring serviceName = GetDlgText(IDC_SERVICE_NAME);
    bool autoStart = (IsDlgButtonChecked(g_hDlg, IDC_AUTO_START) == BST_CHECKED);

    if (installDir.empty() || serverUrl.empty() || serviceName.empty()) {
        SetStatus(L"All fields are required.");
        return;
    }

    // Disable buttons during install
    EnableWindow(GetDlgItem(g_hDlg, IDB_INSTALL), FALSE);
    EnableWindow(GetDlgItem(g_hDlg, IDB_UNINSTALL), FALSE);

    // Step 1: Create directories
    SetStatus(L"Creating directory tree...");
    if (!CreateDirectoryTree(installDir)) goto done;

    // Step 2: Copy executables
    {
        SetStatus(L"Copying executables...");
        std::wstring srcDir = GetExeDirectory();
        if (!CopyExecutables(srcDir, installDir)) goto done;
    }

    // Step 3: Write configs
    SetStatus(L"Writing service_config.json...");
    if (!WriteConfigFile(installDir, serverUrl)) goto done;

    SetStatus(L"Writing log_config.json...");
    if (!WriteLogConfigFile(installDir)) goto done;

    // Step 4: Register service
    SetStatus(L"Registering Windows Service...");
    if (!RegisterService(installDir, serviceName)) goto done;

    // Step 5: Start service
    if (autoStart) {
        SetStatus(L"Starting service...");
        if (StartInstalledService(serviceName)) {
            SetStatus(L"Installation complete!\n"
                      L"Service is running. Agent will auto-start within 15 seconds.");
        } else {
            SetStatus(L"Service registered but failed to start.\n"
                      L"Check logs or start manually from services.msc.");
        }
    } else {
        SetStatus(L"Installation complete!\n"
                  L"Service registered. Start it from services.msc when ready.");
    }

    MessageBoxW(g_hDlg, L"Service installed successfully!", L"Success", MB_ICONINFORMATION);

done:
    UpdateInstallButtonState();
    EnableWindow(GetDlgItem(g_hDlg, IDB_UNINSTALL), TRUE);
}


// ── Uninstall Handler ──
static void DoUninstall() {
    std::wstring serviceName = GetDlgText(IDC_SERVICE_NAME);
    if (serviceName.empty()) {
        SetStatus(L"Service name is required.");
        return;
    }

    int confirm = MessageBoxW(g_hDlg,
        L"This will stop and remove the Windows Service,\n"
        L"delete agent_config.json (next launch will require re-registration),\n"
        L"and keep install directories and logs.\n\n"
        L"Continue?",
        L"Confirm Uninstall", MB_YESNO | MB_ICONWARNING);

    if (confirm != IDYES) return;

    EnableWindow(GetDlgItem(g_hDlg, IDB_INSTALL), FALSE);
    EnableWindow(GetDlgItem(g_hDlg, IDB_UNINSTALL), FALSE);

    SetStatus(L"Stopping and removing service...");
    UninstallService(serviceName);

    // Signal Agent to exit via Named Event
    HANDLE hEvent = OpenEventW(EVENT_MODIFY_STATE, FALSE, GLOBAL_AGENT_STOP_EVENT);
    if (hEvent) { SetEvent(hEvent); CloseHandle(hEvent); }

    // Delete agent_config.json so next install shows registration dialog
    std::wstring installDir = GetDlgText(IDC_INSTALL_DIR);
    if (!installDir.empty()) {
        if (installDir.back() != L'\\') installDir += L'\\';
        std::wstring configPath = installDir + L"config\\agent_config.json";
        if (DeleteFileW(configPath.c_str())) {
            SetStatus(L"Agent config deleted. Next launch will require re-registration.");
        }
    }

    UpdateInstallButtonState();
    EnableWindow(GetDlgItem(g_hDlg, IDB_UNINSTALL), TRUE);
}

// ── Dialog Procedure ──
static INT_PTR CALLBACK SetupDialogProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_INITDIALOG:
        g_hDlg = hDlg;
        // Defaults
        SetDlgItemTextW(hDlg, IDC_INSTALL_DIR, L"C:\\LAMS_Dirs");
        SetDlgItemTextW(hDlg, IDC_SERVER_URL, L"http://localhost:5000");
        SetDlgItemTextW(hDlg, IDC_SERVICE_NAME, SERVICE_SCM_NAME_W);
        CheckDlgButton(hDlg, IDC_AUTO_START, BST_CHECKED);
        SetStatus(L"Ready to install.");
        UpdateInstallButtonState();
        return TRUE;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case IDC_BROWSE: {
            IFileOpenDialog *pFolderOpen;
            HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pFolderOpen));
            if (SUCCEEDED(hr)) {
                DWORD dwOptions;
                if (SUCCEEDED(pFolderOpen->GetOptions(&dwOptions))) {
                    pFolderOpen->SetOptions(dwOptions | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
                }
                pFolderOpen->SetTitle(L"Select Install Directory");
                if (SUCCEEDED(pFolderOpen->Show(hDlg))) {
                    IShellItem *pItem;
                    if (SUCCEEDED(pFolderOpen->GetResult(&pItem))) {
                        PWSTR pszFilePath;
                        if (SUCCEEDED(pItem->GetDisplayName(SIGDN_FILESYSPATH, &pszFilePath))) {
                            SetDlgItemTextW(hDlg, IDC_INSTALL_DIR, pszFilePath);
                            CoTaskMemFree(pszFilePath);
                        }
                        pItem->Release();
                    }
                }
                pFolderOpen->Release();
            }
            return TRUE;
        }

        case IDB_INSTALL:
            DoInstall();
            return TRUE;

        case IDB_UNINSTALL:
            DoUninstall();
            return TRUE;

        case IDCANCEL:
            EndDialog(hDlg, IDCANCEL);
            return TRUE;
        }
        break;

    case WM_CLOSE:
        EndDialog(hDlg, IDCANCEL);
        return TRUE;
    }
    return FALSE;
}

// ── Silent Uninstall (for remote decommission via CLI) ──
static int SilentUninstall() {
    std::wstring serviceName = SERVICE_SCM_NAME_W;

    // Stop and unregister the service
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) return 1;

    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(),
                                       SERVICE_STOP | DELETE | SERVICE_QUERY_STATUS);
    if (!hService) {
        CloseServiceHandle(hSCM);
        return 1;
    }

    SERVICE_STATUS status = {};
    ControlService(hService, SERVICE_CONTROL_STOP, &status);
    for (int i = 0; i < 20; i++) {
        (void)QueryServiceStatus(hService, &status);
        if (status.dwCurrentState == SERVICE_STOPPED) break;
        Sleep(500);
    }
    DeleteService(hService);
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);

    // Signal Agent to exit via Named Event
    HANDLE hEvent = OpenEventW(EVENT_MODIFY_STATE, FALSE, GLOBAL_AGENT_STOP_EVENT);
    if (hEvent) { SetEvent(hEvent); CloseHandle(hEvent); }

    // Delete agent_config.json
    wchar_t exePath[MAX_PATH];
    GetModuleFileNameW(NULL, exePath, MAX_PATH);
    std::wstring exeDir = fs::path(exePath).parent_path().wstring();
    std::wstring configPath = exeDir + L"\\agent_config.json";
    DeleteFileW(configPath.c_str());

    return 0;
}

// ── Silent Stop (for remote stop via CLI) ──
static int SilentStop() {
    std::wstring serviceName = SERVICE_SCM_NAME_W;

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
    if (!hSCM) return 1;

    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(),
                                       SERVICE_STOP | SERVICE_QUERY_STATUS);
    if (!hService) {
        CloseServiceHandle(hSCM);
        return 1;
    }

    SERVICE_STATUS status = {};
    ControlService(hService, SERVICE_CONTROL_STOP, &status);
    for (int i = 0; i < 30; i++) {
        (void)QueryServiceStatus(hService, &status);
        if (status.dwCurrentState == SERVICE_STOPPED) break;
        Sleep(500);
    }

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return (status.dwCurrentState == SERVICE_STOPPED) ? 0 : 1;
}

// ── Entry Point ──
int WINAPI WinMain(_In_ HINSTANCE hInstance, _In_opt_ HINSTANCE, _In_ LPSTR lpCmdLine, _In_ int) {
    (void)CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    INITCOMMONCONTROLSEX icex;
    icex.dwSize = sizeof(INITCOMMONCONTROLSEX);
    icex.dwICC = ICC_WIN95_CLASSES | ICC_STANDARD_CLASSES;
    InitCommonControlsEx(&icex);

    // CLI silent mode support for remote decommission
    std::string args(lpCmdLine ? lpCmdLine : "");
    if (args.find("--uninstall") != std::string::npos) {
        int result = SilentUninstall();
        CoUninitialize();
        return result;
    }
    if (args.find("--stop") != std::string::npos) {
        int result = SilentStop();
        CoUninitialize();
        return result;
    }

    // Normal GUI mode
    DialogBoxW(hInstance, MAKEINTRESOURCEW(IDD_SETUP), NULL, SetupDialogProc);

    CoUninitialize();
    return 0;
}
