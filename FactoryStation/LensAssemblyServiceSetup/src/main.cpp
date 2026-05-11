#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif

#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <commctrl.h>
#include <winhttp.h>
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(linker, "\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
#include <shellapi.h>
#include <tlhelp32.h>
#include <string>
#include <filesystem>
#include <fstream>
#include <vector>
#include "../resource.h"
#include "ExeNames.h"
#include "ProcessControl.h"
#include "CleanupEngine.h"
#include "RemoteReporter.h"

namespace fs = std::filesystem;

// ── Globals ──
static HWND g_hDlg = NULL;

// ── Helpers ──
static void SetStatus(const wchar_t* msg) {
    if (!g_hDlg) {
        OutputDebugStringW(msg);
        OutputDebugStringW(L"\r\n");
        return;
    }
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

static std::wstring EnsureTrailingSlash(std::wstring path) {
    if (!path.empty() && path.back() != L'\\') path += L'\\';
    return path;
}

static std::wstring GetBaseDirFromSetupLocation() {
    wchar_t exePath[MAX_PATH];
    GetModuleFileNameW(NULL, exePath, MAX_PATH);

    fs::path exeDir = fs::path(exePath).parent_path();
    if (_wcsicmp(exeDir.filename().c_str(), L"Bundle") == 0) {
        return EnsureTrailingSlash(exeDir.parent_path().wstring());
    }

    return EnsureTrailingSlash(exeDir.wstring());
}

static std::wstring GetCurrentExePath() {
    wchar_t exePath[MAX_PATH];
    GetModuleFileNameW(NULL, exePath, MAX_PATH);
    return exePath;
}

static bool HasArg(const std::vector<std::wstring>& args, const std::wstring& name) {
    for (const auto& arg : args) {
        if (_wcsicmp(arg.c_str(), name.c_str()) == 0) return true;
    }
    return false;
}

static std::wstring GetArgValue(const std::vector<std::wstring>& args, const std::wstring& name) {
    for (size_t i = 0; i + 1 < args.size(); ++i) {
        if (_wcsicmp(args[i].c_str(), name.c_str()) == 0) {
            return args[i + 1];
        }
    }
    return L"";
}

static DWORD GetArgDword(const std::vector<std::wstring>& args, const std::wstring& name) {
    std::wstring value = GetArgValue(args, name);
    if (value.empty()) return 0;
    try {
        return static_cast<DWORD>(std::stoul(value));
    } catch (...) {
        return 0;
    }
}

static int GetArgInt(const std::vector<std::wstring>& args, const std::wstring& name) {
    std::wstring value = GetArgValue(args, name);
    if (value.empty()) return 0;
    try {
        return std::stoi(value);
    } catch (...) {
        return 0;
    }
}

static std::vector<std::wstring> ParseCommandLineArgs() {
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    std::vector<std::wstring> args;
    if (!argv) return args;

    for (int i = 1; i < argc; ++i) {
        args.emplace_back(argv[i]);
    }

    LocalFree(argv);
    return args;
}

static std::wstring QuoteArg(const std::wstring& arg) {
    std::wstring quoted = L"\"";
    for (wchar_t ch : arg) {
        if (ch == L'"') quoted += L"\\\"";
        else quoted += ch;
    }
    quoted += L"\"";
    return quoted;
}

static std::wstring BuildCommandLine(const std::wstring& exePath, const std::vector<std::wstring>& args) {
    std::wstring commandLine = QuoteArg(exePath);
    for (const auto& arg : args) {
        commandLine += L" ";
        commandLine += QuoteArg(arg);
    }
    return commandLine;
}

static bool LaunchProcess(const std::wstring& exePath, const std::vector<std::wstring>& args, bool wait, DWORD* exitCode) {
    std::wstring commandLine = BuildCommandLine(exePath, args);
    std::wstring workDir = fs::path(exePath).parent_path().wstring();

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};

    if (!CreateProcessW(
            NULL,
            commandLine.data(),
            NULL,
            NULL,
            FALSE,
            CREATE_NO_WINDOW,
            NULL,
            workDir.empty() ? NULL : workDir.c_str(),
            &si,
            &pi)) {
        return false;
    }

    if (wait) {
        WaitForSingleObject(pi.hProcess, INFINITE);
        DWORD code = 1;
        GetExitCodeProcess(pi.hProcess, &code);
        if (exitCode) *exitCode = code;
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

static bool IsPathUnderBaseDir(const std::wstring& path, const std::wstring& baseDir) {
    std::error_code ec;
    fs::path canonicalPath = fs::weakly_canonical(path, ec);
    if (ec) canonicalPath = fs::absolute(path, ec);

    fs::path canonicalBase = fs::weakly_canonical(baseDir, ec);
    if (ec) canonicalBase = fs::absolute(baseDir, ec);

    std::wstring p = EnsureTrailingSlash(canonicalPath.parent_path().wstring());
    std::wstring b = EnsureTrailingSlash(canonicalBase.wstring());
    return _wcsnicmp(p.c_str(), b.c_str(), b.size()) == 0;
}

static std::wstring GetTempSetupPath() {
    wchar_t programData[MAX_PATH] = {};
    DWORD len = GetEnvironmentVariableW(L"ProgramData", programData, _countof(programData));
    std::wstring root = (len > 0 && len < _countof(programData))
        ? std::wstring(programData)
        : L"C:\\ProgramData";

    fs::path dir = fs::path(root) / L"LensAssemblyMonitoring" / L"Decommission";
    std::error_code ec;
    fs::create_directories(dir, ec);
    return (dir / L"ServiceSetup.exe").wstring();
}

static bool CopySelfToTemp(std::wstring& tempSetupPath) {
    tempSetupPath = GetTempSetupPath();
    std::error_code ec;
    fs::copy_file(GetCurrentExePath(), tempSetupPath, fs::copy_options::overwrite_existing, ec);
    if (ec) {
        ec.clear();
        fs::path fallback = fs::path(tempSetupPath).parent_path() /
            (L"ServiceSetup_" + std::to_wstring(GetCurrentProcessId()) + L".exe");
        fs::copy_file(GetCurrentExePath(), fallback, fs::copy_options::overwrite_existing, ec);
        if (!ec) {
            tempSetupPath = fallback.wstring();
        }
    }
    return !ec && fs::exists(tempSetupPath);
}

static std::string JsonEscape(const std::string& value) {
    std::string escaped;
    escaped.reserve(value.size());
    for (char ch : value) {
        switch (ch) {
        case '\\': escaped += "\\\\"; break;
        case '"': escaped += "\\\""; break;
        case '\n': escaped += "\\n"; break;
        case '\r': escaped += "\\r"; break;
        case '\t': escaped += "\\t"; break;
        default: escaped += ch; break;
        }
    }
    return escaped;
}

static std::wstring BuildEndpointUrl(std::wstring serverUrl) {
    while (!serverUrl.empty() && serverUrl.back() == L'/') serverUrl.pop_back();
    return serverUrl + L"/api/agent/commandresult";
}

static bool ReportRemoteCommandResult(
    const std::wstring& serverUrl,
    int commandId,
    const std::string& status,
    const std::string& resultData,
    const std::string& errorMessage) {

    if (serverUrl.empty() || commandId <= 0) return false;

    std::wstring url = BuildEndpointUrl(serverUrl);

    URL_COMPONENTS components = {};
    components.dwStructSize = sizeof(components);
    components.dwSchemeLength = (DWORD)-1;
    components.dwHostNameLength = (DWORD)-1;
    components.dwUrlPathLength = (DWORD)-1;
    components.dwExtraInfoLength = (DWORD)-1;

    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &components)) {
        return false;
    }

    std::wstring host(components.lpszHostName, components.dwHostNameLength);
    std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
    if (components.dwExtraInfoLength > 0) {
        path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
    }

    bool useHttps = components.nScheme == INTERNET_SCHEME_HTTPS;
    INTERNET_PORT port = components.nPort;

    std::string body = "{";
    body += "\"commandId\":" + std::to_string(commandId) + ",";
    body += "\"status\":\"" + JsonEscape(status) + "\",";
    body += "\"resultData\":\"" + JsonEscape(resultData) + "\",";
    body += "\"errorMessage\":";
    if (errorMessage.empty()) {
        body += "null";
    } else {
        body += "\"" + JsonEscape(errorMessage) + "\"";
    }
    body += "}";

    HINTERNET session = WinHttpOpen(
        L"LensAssemblyServiceSetup/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (!session) return false;

    WinHttpSetTimeouts(session, 5000, 5000, 5000, 15000);
    HINTERNET connect = WinHttpConnect(session, host.c_str(), port, 0);
    if (!connect) {
        WinHttpCloseHandle(session);
        return false;
    }

    DWORD flags = useHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET request = WinHttpOpenRequest(
        connect,
        L"POST",
        path.c_str(),
        NULL,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        flags);
    if (!request) {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return false;
    }

    std::wstring headers = L"Content-Type: application/json\r\n";
    BOOL sent = WinHttpSendRequest(
        request,
        headers.c_str(),
        (DWORD)-1L,
        (LPVOID)body.data(),
        (DWORD)body.size(),
        (DWORD)body.size(),
        0);

    bool ok = false;
    if (sent && WinHttpReceiveResponse(request, NULL)) {
        DWORD statusCode = 0;
        DWORD statusSize = sizeof(statusCode);
        if (WinHttpQueryHeaders(
                request,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX,
                &statusCode,
                &statusSize,
                WINHTTP_NO_HEADER_INDEX)) {
            ok = statusCode >= 200 && statusCode < 300;
        }
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return ok;
}

static void WaitForProcessExit(DWORD pid) {
    if (pid == 0) return;
    HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, pid);
    if (!process) return;
    WaitForSingleObject(process, 60000);
    CloseHandle(process);
}

static void StopProcessByPid(DWORD pid) {
    if (pid == 0 || pid == GetCurrentProcessId()) return;
    HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (!process) return;
    TerminateProcess(process, 0);
    CloseHandle(process);
}

static void StopProcessByName(const wchar_t* processName) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return;

    PROCESSENTRY32W entry = {};
    entry.dwSize = sizeof(entry);

    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (_wcsicmp(entry.szExeFile, processName) == 0) {
                HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, entry.th32ProcessID);
                if (process) {
                    TerminateProcess(process, 0);
                    CloseHandle(process);
                }
            }
        } while (Process32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
}

struct CleanupStats {
    int deleted = 0;
    int scheduled = 0;
    int failed = 0;
};

static void DeleteFileOrSchedule(const fs::path& path, CleanupStats& stats) {
    DWORD attrs = GetFileAttributesW(path.c_str());
    if (attrs == INVALID_FILE_ATTRIBUTES) {
        DWORD err = GetLastError();
        if (err == ERROR_FILE_NOT_FOUND || err == ERROR_PATH_NOT_FOUND) return;
    }

    SetFileAttributesW(path.c_str(), FILE_ATTRIBUTE_NORMAL);
    if (DeleteFileW(path.c_str())) {
        stats.deleted++;
        return;
    }
    if (MoveFileExW(path.c_str(), NULL, MOVEFILE_DELAY_UNTIL_REBOOT)) {
        stats.scheduled++;
        return;
    }
    stats.failed++;
}

static void RemoveDirOrSchedule(const fs::path& path, CleanupStats& stats) {
    if (RemoveDirectoryW(path.c_str())) {
        stats.deleted++;
        return;
    }
    if (MoveFileExW(path.c_str(), NULL, MOVEFILE_DELAY_UNTIL_REBOOT)) {
        stats.scheduled++;
        return;
    }
    stats.failed++;
}

static void RemoveTreeBestEffort(const fs::path& path, CleanupStats& stats) {
    std::error_code ec;
    if (!fs::exists(path, ec)) return;

    if (!fs::is_directory(path, ec) || fs::is_symlink(path, ec)) {
        DeleteFileOrSchedule(path, stats);
        return;
    }

    for (const auto& entry : fs::directory_iterator(path, fs::directory_options::skip_permission_denied, ec)) {
        if (ec) {
            stats.failed++;
            ec.clear();
            continue;
        }
        RemoveTreeBestEffort(entry.path(), stats);
    }

    RemoveDirOrSchedule(path, stats);
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
        EXE_NAME_UPDATER_W,
        L"ServiceSetup.exe"
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
            return true;
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

static int RunUninstall(
    const std::wstring& baseDirInput,
    const std::wstring& serviceName,
    bool fullCleanup,
    bool invokedByAgent,
    DWORD waitPid,
    DWORD agentPid) {

    WaitForProcessExit(waitPid);

    std::wstring baseDir = EnsureTrailingSlash(baseDirInput.empty()
        ? GetBaseDirFromSetupLocation()
        : baseDirInput);

    bool serviceOk = UninstallService(serviceName);

    StopProcessByName(EXE_NAME_UPDATER_W);

    if (!invokedByAgent) {
        HANDLE hEvent = OpenEventW(EVENT_MODIFY_STATE, FALSE, GLOBAL_AGENT_STOP_EVENT);
        if (hEvent) { SetEvent(hEvent); CloseHandle(hEvent); }
        Sleep(1000);
        StopProcessByPid(agentPid);
        StopProcessByName(EXE_NAME_AGENT_W);
    }

    // Wait for all target processes to fully exit before touching files
    const wchar_t* processNames[] = { EXE_NAME_SERVICE_W, EXE_NAME_AGENT_W, EXE_NAME_UPDATER_W };
    for (const auto& name : processNames) {
        for (int attempt = 0; attempt < 30; ++attempt) {
            HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snap == INVALID_HANDLE_VALUE) break;
            bool found = false;
            PROCESSENTRY32W pe = {};
            pe.dwSize = sizeof(pe);
            if (Process32FirstW(snap, &pe)) {
                do {
                    if (_wcsicmp(pe.szExeFile, name) == 0) { found = true; break; }
                } while (Process32NextW(snap, &pe));
            }
            CloseHandle(snap);
            if (!found) break;
            Sleep(500);
        }
    }

    CleanupStats stats;
    DeleteFileOrSchedule(fs::path(baseDir) / L"config" / L"agent_config.json", stats);

    if (fullCleanup) {
        const std::wstring targets[] = {
            baseDir + L"Bundle",
            baseDir + L"config",
            baseDir + L"crashes",
            baseDir + L"update",
            baseDir + L"backup",
            baseDir + L".update_command_id",
            baseDir + L".update_result"
        };

        for (const auto& target : targets) {
            RemoveTreeBestEffort(target, stats);
        }
    }

    return (serviceOk && stats.failed == 0) ? 0 : 2;
}

static std::vector<std::wstring> BuildUninstallArgs(
    const std::wstring& baseDir,
    bool fullCleanup,
    bool invokedByAgent,
    DWORD waitPid,
    bool cleanupWorker) {

    std::vector<std::wstring> args = { L"--uninstall" };
    if (fullCleanup) args.push_back(L"--full-cleanup");
    if (invokedByAgent) args.push_back(L"--invoked-by-agent");
    if (cleanupWorker) args.push_back(L"--cleanup-worker");
    if (!baseDir.empty()) {
        args.push_back(L"--base-dir");
        args.push_back(baseDir);
    }
    if (waitPid != 0) {
        args.push_back(L"--wait-pid");
        args.push_back(std::to_wstring(waitPid));
    }
    return args;
}

static bool StartTempCleanupWorker(
    const std::wstring& baseDir,
    bool fullCleanup,
    bool invokedByAgent,
    DWORD waitPid,
    bool waitForExit,
    DWORD* exitCode) {

    std::wstring tempSetupPath;
    if (!CopySelfToTemp(tempSetupPath)) {
        return false;
    }

    auto args = BuildUninstallArgs(baseDir, fullCleanup, invokedByAgent, waitPid, true);
    return LaunchProcess(tempSetupPath, args, waitForExit, exitCode);
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
        L"stop the Agent and AutoUpdater,\n"
        L"delete Bundle, config, crashes, update, and backup folders,\n"
        L"and preserve LAI and logs.\n\n"
        L"Continue?",
        L"Confirm Uninstall", MB_YESNO | MB_ICONWARNING);

    if (confirm != IDYES) return;

    EnableWindow(GetDlgItem(g_hDlg, IDB_INSTALL), FALSE);
    EnableWindow(GetDlgItem(g_hDlg, IDB_UNINSTALL), FALSE);

    std::wstring installDir = GetDlgText(IDC_INSTALL_DIR);
    installDir = EnsureTrailingSlash(installDir);

    SetStatus(L"Stopping service and cleaning installed bundle...");

    if (IsPathUnderBaseDir(GetCurrentExePath(), installDir)) {
        DWORD exitCode = 1;
        if (StartTempCleanupWorker(installDir, true, false, GetCurrentProcessId(), false, &exitCode)) {
            SetStatus(L"Cleanup worker started. This setup window will close so installed files can be removed.");
            EndDialog(g_hDlg, IDOK);
            return;
        }
        SetStatus(L"Failed to start cleanup worker from ProgramData.");
    } else {
        int result = RunUninstall(installDir, serviceName, true, false, 0, 0);
        if (result == 0) {
            SetStatus(L"Uninstall complete. LAI and logs were preserved.");
        } else {
            SetStatus(L"Uninstall completed with cleanup errors. Some files may remain or require reboot cleanup.");
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
static int SilentUninstall(const std::vector<std::wstring>& args) {
    bool fullCleanup = HasArg(args, L"--full-cleanup");
    bool invokedByAgent = HasArg(args, L"--invoked-by-agent");
    bool cleanupWorker = HasArg(args, L"--cleanup-worker");
    bool remoteDecommission = HasArg(args, L"--remote-decommission");
    DWORD waitPid = GetArgDword(args, L"--wait-pid");
    DWORD agentPid = GetArgDword(args, L"--agent-pid");
    int commandId = GetArgInt(args, L"--command-id");
    std::wstring serverUrl = GetArgValue(args, L"--server-url");

    std::wstring baseDir = GetArgValue(args, L"--base-dir");
    if (baseDir.empty()) {
        baseDir = GetBaseDirFromSetupLocation();
    }
    baseDir = EnsureTrailingSlash(baseDir);

    if (fullCleanup && !cleanupWorker && IsPathUnderBaseDir(GetCurrentExePath(), baseDir)) {
        DWORD exitCode = 1;
        if (!StartTempCleanupWorker(baseDir, fullCleanup, invokedByAgent, GetCurrentProcessId(), true, &exitCode)) {
            return 1;
        }
        return static_cast<int>(exitCode);
    }

    std::wstring serviceName = GetArgValue(args, L"--service-name");
    if (serviceName.empty()) serviceName = SERVICE_SCM_NAME_W;

    int result = RunUninstall(baseDir, serviceName, fullCleanup, invokedByAgent, waitPid, agentPid);

    if (remoteDecommission) {
        bool cleanupOk = result == 0;
        std::string status = cleanupOk ? "Completed" : "Failed";
        std::string resultData = cleanupOk
            ? "Remote decommission cleanup completed. LAI and logs were preserved."
            : "Remote decommission cleanup failed.";
        std::string errorMessage = cleanupOk
            ? ""
            : "ServiceSetup cleanup failed or could not schedule all removals. Exit code: " + std::to_string(result);

        if (!ReportRemoteCommandResult(serverUrl, commandId, status, resultData, errorMessage)) {
            OutputDebugStringW(L"Failed to report remote decommission result.\r\n");
        }
    }

    return result;
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
    (void)lpCmdLine;
    (void)CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    INITCOMMONCONTROLSEX icex;
    icex.dwSize = sizeof(INITCOMMONCONTROLSEX);
    icex.dwICC = ICC_WIN95_CLASSES | ICC_STANDARD_CLASSES;
    InitCommonControlsEx(&icex);

    // CLI silent mode support for remote decommission
    std::vector<std::wstring> args = ParseCommandLineArgs();
    if (HasArg(args, L"--uninstall")) {
        int result = SilentUninstall(args);
        CoUninitialize();
        return result;
    }
    if (HasArg(args, L"--stop")) {
        int result = SilentStop();
        CoUninitialize();
        return result;
    }

    // Normal GUI mode
    DialogBoxW(hInstance, MAKEINTRESOURCEW(IDD_SETUP), NULL, SetupDialogProc);

    CoUninitialize();
    return 0;
}
