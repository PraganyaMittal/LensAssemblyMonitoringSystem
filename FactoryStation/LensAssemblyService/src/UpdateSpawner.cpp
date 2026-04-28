#include "pch.h"
#include "UpdateSpawner.h"
#include "ServiceConfig.h"
#include "ServiceStagingPipeline.h"
#include "PipeProtocol.h"
#include "ServiceLogger.h"
#include <tlhelp32.h>

namespace fs = std::filesystem;

std::wstring UpdateSpawner::GetUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe) {
	return baseDir + L"Bundle\\" + updaterExe;
}

std::wstring UpdateSpawner::GetStagedUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe) {
	return baseDir + L"update\\Bundle\\" + updaterExe;
}

std::wstring UpdateSpawner::GetBackupUpdaterPath(const std::wstring& baseDir, const std::wstring& updaterExe) {
	return baseDir + L"backup\\Bundle\\" + updaterExe;
}

bool UpdateSpawner::UpdateUpdaterExe(const ServiceConfig& config, const std::wstring& baseDir, bool isRollback) {
	std::wstring currentUpdater = GetUpdaterPath(baseDir, config.updaterExe);
	std::wstring stagedUpdater  = GetStagedUpdaterPath(baseDir, config.updaterExe);
	std::wstring backupUpdater  = GetBackupUpdaterPath(baseDir, config.updaterExe);

	if (isRollback) {
		// ── ROLLBACK: Downgrade AutoUpdater from backup ──
		// Service installs old AutoUpdater from backup BEFORE spawning it.
		// This ensures full version parity after rollback.
		if (GetFileAttributesW(backupUpdater.c_str()) == INVALID_FILE_ATTRIBUTES) {
			PIPE_LOG_INFO("[UpdateSpawner] No backup AutoUpdater found. Using current version for rollback.");
			return true;
		}

		PIPE_LOG_INFO("[UpdateSpawner] Downgrading AutoUpdater from backup for rollback...");
		if (!CopyFileW(backupUpdater.c_str(), currentUpdater.c_str(), FALSE)) {
			PIPE_LOG_ERROR("[UpdateSpawner] Failed to downgrade AutoUpdater. Error: " << GetLastError());
			return false;
		}
		PIPE_LOG_INFO("[UpdateSpawner] AutoUpdater downgraded from backup.");

		// Remove the staged copy if it exists (it contains the backup AutoUpdater from HandleRollback)
		if (GetFileAttributesW(stagedUpdater.c_str()) != INVALID_FILE_ATTRIBUTES) {
			DeleteFileW(stagedUpdater.c_str());
		}

		return true;
	}

	// ── UPDATE: Backup current, install new from staging ──
	std::wstring backupDir = baseDir + L"backup\\";
	std::wstring backupBundleDir = backupDir + L"Bundle\\";
	CreateDirectoryW(backupDir.c_str(), NULL);
	CreateDirectoryW(backupBundleDir.c_str(), NULL);

	// Backup current AutoUpdater (only if backup doesn't already exist)
	if (GetFileAttributesW(currentUpdater.c_str()) != INVALID_FILE_ATTRIBUTES) {
		if (GetFileAttributesW(backupUpdater.c_str()) != INVALID_FILE_ATTRIBUTES) {
			PIPE_LOG_INFO("[UpdateSpawner] AutoUpdater backup already exists. Preserving original.");
		} else {
			if (CopyFileW(currentUpdater.c_str(), backupUpdater.c_str(), FALSE)) {
				PIPE_LOG_INFO("[UpdateSpawner] Backed up " << ServiceConfig::WtoA(config.updaterExe));
			} else {
				PIPE_LOG_ERROR("[UpdateSpawner] Failed to backup " << ServiceConfig::WtoA(config.updaterExe)
					<< ". Error: " << GetLastError());
				return false;
			}
		}
	}

	// Install staged AutoUpdater (if available)
	if (GetFileAttributesW(stagedUpdater.c_str()) == INVALID_FILE_ATTRIBUTES) {
		PIPE_LOG_INFO("[UpdateSpawner] No new AutoUpdater in staging. Using existing.");
		return true;
	}

	PIPE_LOG_INFO("[UpdateSpawner] New AutoUpdater found in staging.");

	if (!CopyFileW(stagedUpdater.c_str(), currentUpdater.c_str(), FALSE)) {
		PIPE_LOG_ERROR("[UpdateSpawner] Failed to install new AutoUpdater. Error: " << GetLastError());
		CopyFileW(backupUpdater.c_str(), currentUpdater.c_str(), FALSE);
		return false;
	}

	PIPE_LOG_INFO("[UpdateSpawner] New AutoUpdater installed.");
	DeleteFileW(stagedUpdater.c_str());
	return true;
}

bool UpdateSpawner::SpawnAutoUpdater(const ServiceConfig& config, const DeployRequest& req,
                                     HANDLE stopEvent) {
	if (IsUpdaterRunning(config.updaterExe)) {
		PIPE_LOG_ERROR("[UpdateSpawner] AutoUpdater already running. Skipping spawn.");
		return false;
	}

	std::wstring baseDir = config.baseDir;

	std::wstring updaterPath = GetUpdaterPath(baseDir, config.updaterExe);

	if (GetFileAttributesW(updaterPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
		PIPE_LOG_ERROR("[UpdateSpawner] AutoUpdater not found at: " << ServiceConfig::WtoA(updaterPath));
		return false;
	}

	bool isBundle = (req.type.find("Bundle") != std::string::npos);
	std::wstring typeStr = isBundle ? L"bundle" : L"lai";

	// Build command line with ALL paths as arguments (no hardcoded paths in AutoUpdater)
	std::wstring safeBaseDir = baseDir;
	while (!safeBaseDir.empty() && safeBaseDir.back() == L'\\') {
		safeBaseDir.pop_back();
	}

	std::wstring scmName = config.serviceExeName;
	if (scmName.size() > 4 && scmName.substr(scmName.size() - 4) == L".exe") {
		scmName = scmName.substr(0, scmName.size() - 4);
	}

	std::wstring cmdLine = L"\"" + updaterPath + L"\"";
	cmdLine += L" --base-dir \"" + safeBaseDir + L"\"";
	cmdLine += L" --type " + typeStr;
	cmdLine += L" --agent-exe \"" + config.agentExe + L"\"";
	cmdLine += L" --service-name \"" + scmName + L"\"";
	cmdLine += L" --lai-exe \"" + config.laiExe + L"\"";
	cmdLine += L" --updater-exe \"" + config.updaterExe + L"\"";

	if (req.isRollback) {
		cmdLine += L" --rollback";
	}

	PIPE_LOG_INFO("[UpdateSpawner] Command: " << ServiceConfig::WtoA(cmdLine));

	std::vector<wchar_t> cmdLineBuf(cmdLine.begin(), cmdLine.end());
	cmdLineBuf.push_back(L'\0');

	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	PROCESS_INFORMATION pi = {};

	std::wstring bundleDir = baseDir + L"Bundle\\";
	BOOL ok = CreateProcessW(
		updaterPath.c_str(),
		cmdLineBuf.data(),
		NULL, NULL, FALSE,
		CREATE_NO_WINDOW,
		NULL,
		bundleDir.c_str(),
		&si,
		&pi
	);

	if (!ok) {
		PIPE_LOG_ERROR("[UpdateSpawner] CreateProcess failed. Error: " << GetLastError());
		return false;
	}

	PIPE_LOG_INFO("[UpdateSpawner] AutoUpdater spawned. PID: " << pi.dwProcessId);

	if (stopEvent && isBundle) {
		// For bundle updates, signal service stop (AutoUpdater will restart service)
		SetEvent(stopEvent);
	}

	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);

	PIPE_LOG_INFO("[UpdateSpawner] Spawn completed.");
	return true;
}

bool UpdateSpawner::IsUpdaterRunning(const std::wstring& updaterExeName) {
	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if (snapshot == INVALID_HANDLE_VALUE) return false;

	PROCESSENTRY32W pe = {};
	pe.dwSize = sizeof(pe);
	bool found = false;

	if (Process32FirstW(snapshot, &pe)) {
		do {
			if (_wcsicmp(pe.szExeFile, updaterExeName.c_str()) == 0) {
				found = true;
				break;
			}
		} while (Process32NextW(snapshot, &pe));
	}
	CloseHandle(snapshot);
	return found;
}
