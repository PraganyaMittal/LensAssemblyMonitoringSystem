#pragma once

// ServiceConfig — Configuration loaded from service_config.json
// No hardcoded paths. All paths derived from baseDir.

#include <windows.h>
#include <string>
#include <fstream>
#include <filesystem>

// Minimal JSON value extraction (no external dependency needed)
namespace ConfigJsonHelper {
	inline std::string ExtractString(const std::string& json, const std::string& key) {
		std::string search = "\"" + key + "\"";
		size_t keyPos = json.find(search);
		if (keyPos == std::string::npos) return "";

		size_t colonPos = json.find(':', keyPos + search.size());
		if (colonPos == std::string::npos) return "";

		size_t quoteStart = json.find('"', colonPos + 1);
		if (quoteStart == std::string::npos) return "";
		quoteStart++;

		std::string result;
		for (size_t i = quoteStart; i < json.size(); i++) {
			if (json[i] == '"') break;
			if (json[i] == '\\' && i + 1 < json.size()) {
				i++;
				if (json[i] == '\\') result += '\\';
				else if (json[i] == '"') result += '"';
				else if (json[i] == 'n') result += '\n';
				else result += json[i];
			} else {
				result += json[i];
			}
		}
		return result;
	}
}

struct ServiceConfig {
	// From config file
	std::wstring serverUrl;
	std::wstring agentExe;
	std::wstring serviceExeName;
	std::wstring laiExe;
	std::wstring updaterExe;

	// baseDir is derived from service exe location (parent of Bundle\)
	std::wstring baseDir;

	// Derived paths (computed from baseDir)
	std::wstring bundleDir;
	std::wstring laiDir;
	std::wstring updateDir;
	std::wstring backupDir;
	std::wstring logDir;

	void InitDerivedPaths() {
		// Ensure baseDir ends with backslash
		if (!baseDir.empty() && baseDir.back() != L'\\') {
			baseDir += L'\\';
		}
		bundleDir = baseDir + L"Bundle\\";
		laiDir    = baseDir + L"LAI\\";
		updateDir = baseDir + L"update\\";
		backupDir = baseDir + L"backup\\";
		logDir    = baseDir + L"logs\\";
	}

	// Bootstrap the full directory tree under baseDir.
	// Called once at Service startup. Idempotent — safe to call repeatedly.
	void EnsureDirectoryTree() {
		const std::wstring dirs[] = {
			bundleDir,                      // Bundle        — executables
			laiDir,                         // LAI           — LAI application
			updateDir,                      // update        — staging root
			updateDir + L"Bundle\\",        // update\Bundle — staged bundle
			updateDir + L"LAI\\",           // update\LAI    — staged LAI
			backupDir,                      // backup        — rollback root
			backupDir + L"Bundle\\",        // backup\Bundle — rollback bundle
			backupDir + L"LAI\\",           // backup\LAI    — rollback LAI
			logDir                          // logs          — service/updater logs
		};
		for (const auto& dir : dirs) {
			try {
				std::filesystem::create_directories(dir);
			} catch (...) {
				// Best effort — log will catch failures downstream
			}
		}
	}

	// Derive baseDir from the service exe location.
	// Service exe is at: C:\LAMS_Dirs\Bundle\LensAssemblyService.exe
	// So baseDir = parent of Bundle = C:\LAMS_Dirs
	void DeriveBaseDirFromExe() {
		wchar_t exePath[MAX_PATH];
		if (GetModuleFileNameW(NULL, exePath, MAX_PATH)) {
			std::filesystem::path p(exePath);
			// exePath = .../Bundle/LensAssemblyService.exe
			// parent_path() = .../Bundle
			// parent_path().parent_path() = .../
			baseDir = p.parent_path().parent_path().wstring();
			if (!baseDir.empty() && baseDir.back() != L'\\') {
				baseDir += L'\\';
			}
		}
	}

	static std::wstring AtoW(const std::string& str) {
		if (str.empty()) return L"";
		int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), nullptr, 0);
		std::wstring result(size, 0);
		MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), &result[0], size);
		return result;
	}

	static std::string WtoA(const std::wstring& wstr) {
		if (wstr.empty()) return "";
		int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), nullptr, 0, nullptr, nullptr);
		std::string result(size, 0);
		WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &result[0], size, nullptr, nullptr);
		return result;
	}

	// Load from service_config.json next to the service exe
	bool LoadFromFile() {
		wchar_t exePath[MAX_PATH];
		if (!GetModuleFileNameW(NULL, exePath, MAX_PATH)) return false;

		std::filesystem::path configPath = std::filesystem::path(exePath).parent_path() / L"service_config.json";

		std::ifstream file(configPath);
		if (!file.is_open()) return false;

		std::string content((std::istreambuf_iterator<char>(file)),
		                     std::istreambuf_iterator<char>());
		file.close();

		serverUrl      = AtoW(ConfigJsonHelper::ExtractString(content, "serverUrl"));
		agentExe       = AtoW(ConfigJsonHelper::ExtractString(content, "agentExe"));
		serviceExeName = AtoW(ConfigJsonHelper::ExtractString(content, "serviceExe"));
		laiExe         = AtoW(ConfigJsonHelper::ExtractString(content, "laiExe"));
		updaterExe     = AtoW(ConfigJsonHelper::ExtractString(content, "updaterExe"));

		// Derive baseDir from exe location, not from config file
		DeriveBaseDirFromExe();
		InitDerivedPaths();

		// Validate required fields
		if (agentExe.empty())  agentExe  = L"LensAssemblyAgent.exe";
		if (updaterExe.empty()) updaterExe = L"AutoUpdater.exe";
		if (laiExe.empty())    laiExe    = L"LAI.exe";
		if (serviceExeName.empty()) serviceExeName = L"LensAssemblyService.exe";

		return !baseDir.empty();
	}
};
