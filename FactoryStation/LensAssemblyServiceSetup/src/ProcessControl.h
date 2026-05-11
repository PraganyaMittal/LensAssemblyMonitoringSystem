#pragma once

// ============================================================================
// ProcessControl.h — Process lifecycle management for ServiceSetup
// ============================================================================
// Extracted from main.cpp to isolate process termination, waiting, and
// launch logic into a reusable, testable component.
// ============================================================================

#include <windows.h>
#include <tlhelp32.h>
#include <string>
#include <vector>
#include <filesystem>

namespace ProcessControl {

	/// Wait up to 60 seconds for a process to exit.
	inline void WaitForProcessExit(DWORD pid) {
		if (pid == 0) return;
		HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, pid);
		if (!process) return;
		WaitForSingleObject(process, 60000);
		CloseHandle(process);
	}

	/// Terminate a process by PID (skips self).
	inline void StopByPid(DWORD pid) {
		if (pid == 0 || pid == GetCurrentProcessId()) return;
		HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
		if (!process) return;
		TerminateProcess(process, 0);
		CloseHandle(process);
	}

	/// Terminate all processes matching a name (e.g. "Agent.exe").
	inline void StopByName(const wchar_t* processName) {
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

	/// Launch a process with given arguments. Optionally wait for completion.
	/// Returns exit code if waiting, or 0 if fire-and-forget.
	inline int Launch(const std::wstring& exePath, const std::vector<std::wstring>& args,
	                  bool waitForCompletion) {
		std::wstring cmdLine = L"\"" + exePath + L"\"";
		for (const auto& arg : args) {
			cmdLine += L" ";
			// Quote args containing spaces
			if (arg.find(L' ') != std::wstring::npos || arg.find(L'\t') != std::wstring::npos) {
				cmdLine += L"\"" + arg + L"\"";
			} else {
				cmdLine += arg;
			}
		}

		STARTUPINFOW si = {};
		si.cb = sizeof(si);
		si.dwFlags = STARTF_USESHOWWINDOW;
		si.wShowWindow = SW_HIDE;
		PROCESS_INFORMATION pi = {};

		if (!CreateProcessW(exePath.c_str(), cmdLine.data(), NULL, NULL, FALSE,
		                     CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
			return -1;
		}

		int exitCode = 0;
		if (waitForCompletion) {
			WaitForSingleObject(pi.hProcess, INFINITE);
			DWORD code = 0;
			GetExitCodeProcess(pi.hProcess, &code);
			exitCode = static_cast<int>(code);
		}

		CloseHandle(pi.hThread);
		CloseHandle(pi.hProcess);
		return exitCode;
	}

} // namespace ProcessControl
