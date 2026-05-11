#pragma once

// ============================================================================
// PathResolver.h — Single-source path resolution from executable location
// ============================================================================
// Replaces 5+ copies of manual GetModuleFileName + find_last_of("\\") logic:
//   - CommandExecutor.cpp  (decommission, rollback, deploy — 3 copies)
//   - AgentCore.cpp        (CheckUpdateResult — 1 copy)
//   - HeartbeatService.cpp (CacheVersionInfo — 1 copy)
//
// All agents/services/tools derive their directory structure from the exe path:
//   exe location:  <baseDir>\Bundle\<exe>.exe
//   base dir:      <baseDir>\
//   subdirectories: Bundle\, LAI\, config\, logs\, update\, backup\, crashes\
// ============================================================================

#include <windows.h>
#include <string>
#include <filesystem>

#include "StringUtils.h"

namespace PathResolver {

	// ── Core resolver: derives baseDir from the running executable ──
	// Layout: <baseDir>\Bundle\Agent.exe → returns <baseDir>\ (with trailing slash)

	inline std::wstring ResolveBaseDirW() {
		wchar_t exePath[MAX_PATH] = {};
		DWORD len = GetModuleFileNameW(NULL, exePath, MAX_PATH);
		if (len == 0 || len >= MAX_PATH) return L"";

		// exe → parent (Bundle) → parent (baseDir)
		std::filesystem::path p(exePath);
		std::filesystem::path baseDir = p.parent_path().parent_path();
		return StringUtils::EnsureTrailingSlashW(baseDir.wstring());
	}

	inline std::string ResolveBaseDirA() {
		return StringUtils::WtoA(ResolveBaseDirW());
	}

	// ── Subdirectory accessors (all return paths with trailing slash) ──

	inline std::wstring BundleDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"Bundle\\";
	}

	inline std::wstring LaiDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"LAI\\";
	}

	inline std::wstring ConfigDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"config\\";
	}

	inline std::wstring LogsDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"logs\\";
	}

	inline std::wstring UpdateDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"update\\";
	}

	inline std::wstring BackupDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"backup\\";
	}

	inline std::wstring CrashesDirW(const std::wstring& baseDir) {
		return StringUtils::EnsureTrailingSlashW(baseDir) + L"crashes\\";
	}

	// ── Narrow (UTF-8) versions ──

	inline std::string BundleDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "Bundle\\";
	}

	inline std::string LaiDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "LAI\\";
	}

	inline std::string ConfigDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "config\\";
	}

	inline std::string LogsDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "logs\\";
	}

	inline std::string UpdateDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "update\\";
	}

	inline std::string BackupDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "backup\\";
	}

	inline std::string CrashesDirA(const std::string& baseDir) {
		return StringUtils::EnsureTrailingSlashA(baseDir) + "crashes\\";
	}

} // namespace PathResolver
