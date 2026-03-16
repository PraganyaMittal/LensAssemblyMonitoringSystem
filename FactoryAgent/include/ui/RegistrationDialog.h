#ifndef REGISTRATION_DIALOG_H
#define REGISTRATION_DIALOG_H



#include <windows.h>
#include "common/Types.h"
#include <vector>

#define IDD_REGISTRATION 101
#define IDC_LINE_NUMBER 1001
#define IDC_PC_NUMBER 1002
#define IDC_CONFIG_PATH 1003
#define IDC_LOG_PATH 1004
#define IDC_MODEL_PATH 1005
#define IDC_MODEL_VERSION 1006
#define IDC_SERVER_URL 1007
#define IDC_EXE_NAME 1008

class RegistrationDialog {
public:
    static bool ShowDialog(HINSTANCE hInstance, AgentSettings& settings);

private:
    static INT_PTR CALLBACK DialogProc(HWND hDlg, UINT message, WPARAM wParam, LPARAM lParam);
    static AgentSettings* settings_;

    RegistrationDialog();
};

#endif