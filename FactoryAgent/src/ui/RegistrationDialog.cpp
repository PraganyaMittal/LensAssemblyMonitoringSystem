#include "../include/ui/RegistrationDialog.h"
#include "../include/common/Constants.h"
#include <commdlg.h>
#include <shlobj.h>
#include "../../resource.h"
#include "../include/utilities/NetworkUtils.h"

AgentSettings* RegistrationDialog::settings_ = NULL;

bool RegistrationDialog::ShowDialog(HINSTANCE hInstance, AgentSettings& settings) {
    settings_ = &settings;

    settings.lineNumber = 1;
    settings.mcNumber = 1;
    settings.modelVersion = "3.5";
    settings.serverUrl = L"http://localhost:5000";
    settings.exeName = L"msedge.exe";

    INT_PTR result = DialogBoxParam(hInstance, MAKEINTRESOURCE(IDD_REGISTRATION),
        NULL, DialogProc, (LPARAM)&settings);
    return (result == IDOK);
}

INT_PTR CALLBACK RegistrationDialog::DialogProc(HWND hDlg, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_INITDIALOG:
    {
        SetDlgItemInt(hDlg, IDC_LINE_NUMBER, 1, FALSE);
        SetDlgItemInt(hDlg, IDC_PC_NUMBER, 1, FALSE);
        SetDlgItemTextA(hDlg, IDC_CONFIG_PATH, "C:\\LAI\\LAI-Operational\\config.ini");
        SetDlgItemTextA(hDlg, IDC_LOG_PATH, "C:\\LAI\\LAI-WorkData\\Log");
        SetDlgItemTextA(hDlg, IDC_MODEL_PATH, "C:\\LAI\\LAI-Operational\\Model");
        SetDlgItemTextW(hDlg, IDC_SERVER_URL, L"http://localhost:5000");
        SetDlgItemTextW(hDlg, IDC_EXE_NAME, L"msedge.exe");
        SetDlgItemTextA(hDlg, IDC_YIELD_PATH, "C:\\LAI_Result_Current"); 
        SetDlgItemTextA(hDlg, IDC_INSTALL_DIR, AgentConstants::DEFAULT_INSTALL_DIR); 

        
        HWND hVersionCombo = GetDlgItem(hDlg, IDC_MODEL_VERSION);
        if (hVersionCombo) {
            SendMessageA(hVersionCombo, CB_ADDSTRING, 0, (LPARAM)"3.5");
            SendMessageA(hVersionCombo, CB_ADDSTRING, 0, (LPARAM)"4.0");
            
            SendMessageA(hVersionCombo, CB_SETCURSEL, 0, 0);
        }
        return TRUE;
    }

    case WM_COMMAND:
        if (LOWORD(wParam) == IDOK) {
            if (settings_) {
                settings_->lineNumber = GetDlgItemInt(hDlg, IDC_LINE_NUMBER, NULL, FALSE);
                settings_->mcNumber = GetDlgItemInt(hDlg, IDC_PC_NUMBER, NULL, FALSE);

                char configPath[AgentConstants::MAX_PATH_LENGTH];
                char logPath[AgentConstants::MAX_PATH_LENGTH];
                char yieldPath[AgentConstants::MAX_PATH_LENGTH];
                char modelPath[AgentConstants::MAX_PATH_LENGTH];
                char modelVersion[32];
                wchar_t serverUrl[AgentConstants::MAX_PATH_LENGTH];
                wchar_t exeName[AgentConstants::MAX_PATH_LENGTH];
                char installDir[AgentConstants::MAX_PATH_LENGTH];

                GetDlgItemTextA(hDlg, IDC_CONFIG_PATH, configPath, AgentConstants::MAX_PATH_LENGTH);
                GetDlgItemTextA(hDlg, IDC_LOG_PATH, logPath, AgentConstants::MAX_PATH_LENGTH);
                GetDlgItemTextA(hDlg, IDC_YIELD_PATH, yieldPath, AgentConstants::MAX_PATH_LENGTH);
                GetDlgItemTextA(hDlg, IDC_MODEL_PATH, modelPath, AgentConstants::MAX_PATH_LENGTH);

                
                auto isDirectory = [](const char* p) {
                    DWORD attr = GetFileAttributesA(p);
                    return (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY));
                };
                auto isFile = [](const char* p) {
                    DWORD attr = GetFileAttributesA(p);
                    return (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY));
                };

                if (!isFile(configPath)) {
                    MessageBoxA(hDlg, "Invalid Config Path. Please select a valid file.", "Validation Error", MB_ICONERROR | MB_OK);
                    return TRUE;
                }
                if (!isDirectory(logPath)) {
                    MessageBoxA(hDlg, "Invalid Log Path. Please select a valid directory.", "Validation Error", MB_ICONERROR | MB_OK);
                    return TRUE;
                }
                if (!isDirectory(yieldPath)) {
                    MessageBoxA(hDlg, "Invalid Yield Path. Please select a valid directory.", "Validation Error", MB_ICONERROR | MB_OK);
                    return TRUE;
                }
                if (!isDirectory(modelPath)) {
                    MessageBoxA(hDlg, "Invalid Model Path. Please select a valid directory.", "Validation Error", MB_ICONERROR | MB_OK);
                    return TRUE;
                }

                
                HWND hVersionCombo = GetDlgItem(hDlg, IDC_MODEL_VERSION);
                modelVersion[0] = '\0';
                if (hVersionCombo) {
                    int sel = (int)SendMessage(hVersionCombo, CB_GETCURSEL, 0, 0);
                    if (sel != CB_ERR) {
                        SendMessageA(hVersionCombo, CB_GETLBTEXT, sel, (LPARAM)modelVersion);
                    }
                }

                GetDlgItemTextW(hDlg, IDC_SERVER_URL, serverUrl, AgentConstants::MAX_PATH_LENGTH);
                GetDlgItemTextW(hDlg, IDC_EXE_NAME, exeName, AgentConstants::MAX_PATH_LENGTH);
                GetDlgItemTextA(hDlg, IDC_INSTALL_DIR, installDir, AgentConstants::MAX_PATH_LENGTH);

                settings_->configFilePath = configPath;
                settings_->logFolderPath = logPath;
                settings_->yieldMonitorPath = NetworkUtils::ConvertStringToWString(yieldPath); 
                settings_->modelFolderPath = modelPath;
                settings_->modelFolderPath = modelPath;
                if (modelVersion[0] != '\0') {
                    settings_->modelVersion = modelVersion;
                }
                settings_->serverUrl = serverUrl;
                settings_->exeName = exeName;
                settings_->installDir = installDir;
            }

            EndDialog(hDlg, IDOK);
            return TRUE;
        }

        else if (LOWORD(wParam) == IDCANCEL) {
            EndDialog(hDlg, IDCANCEL);
            return TRUE;
        }
        else if (LOWORD(wParam) == IDC_BROWSE_CONFIG) {
            char filename[MAX_PATH] = "";
            OPENFILENAMEA ofn;
            ZeroMemory(&ofn, sizeof(ofn));
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = hDlg;
            ofn.lpstrFilter = "Config Files (*.ini)\0*.ini\0All Files (*.*)\0*.*\0";
            ofn.lpstrFile = filename;
            ofn.nMaxFile = MAX_PATH;
            ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;

            if (GetOpenFileNameA(&ofn)) {
                SetDlgItemTextA(hDlg, IDC_CONFIG_PATH, filename);
            }
        }
        else if (LOWORD(wParam) == IDC_BROWSE_LOG || LOWORD(wParam) == IDC_BROWSE_MODEL || LOWORD(wParam) == IDC_BROWSE_YIELD || LOWORD(wParam) == IDC_BROWSE_INSTALL_DIR) {
            BROWSEINFOA bi = { 0 };
            bi.hwndOwner = hDlg;
            bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
            
            const char* title = "Select Folder";
            if (LOWORD(wParam) == IDC_BROWSE_LOG) title = "Select Log Folder";
            else if (LOWORD(wParam) == IDC_BROWSE_MODEL) title = "Select Model Folder";
            else if (LOWORD(wParam) == IDC_BROWSE_YIELD) title = "Select Result Data Path";
            else if (LOWORD(wParam) == IDC_BROWSE_INSTALL_DIR) title = "Select Install Directory";

            bi.lpszTitle = title;

            LPITEMIDLIST pidl = SHBrowseForFolderA(&bi);
            if (pidl != 0) {
                char path[MAX_PATH];
                if (SHGetPathFromIDListA(pidl, path)) {
                    int id = IDC_LOG_PATH;
                    if (LOWORD(wParam) == IDC_BROWSE_MODEL) id = IDC_MODEL_PATH;
                    else if (LOWORD(wParam) == IDC_BROWSE_YIELD) id = IDC_YIELD_PATH;
                    else if (LOWORD(wParam) == IDC_BROWSE_INSTALL_DIR) id = IDC_INSTALL_DIR;
                    
                    SetDlgItemTextA(hDlg, id, path);
                }
                CoTaskMemFree(pidl);
            }
        }
        break;
    }

    return FALSE;
}