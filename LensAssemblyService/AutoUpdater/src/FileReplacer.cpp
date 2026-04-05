#include "pch.h"
#include "FileReplacer.h"
#include "UpdateConfig.h"

namespace fs = std::filesystem;

bool FileReplacer::CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries) {
	for (int attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			fs::copy_file(src, dst, fs::copy_options::overwrite_existing);
			return true;
		} catch (const std::exception& ex) {
			std::cerr << "[FileReplacer] Copy attempt " << attempt << "/" << maxRetries
					  << " failed: " << ex.what() << std::endl;
			if (attempt < maxRetries) {
				std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::FILE_REPLACE_RETRY_MS));
			}
		}
	}
	return false;
}

bool FileReplacer::CopyDirectoryContents(const std::wstring& src, const std::wstring& dst) {
	try {
		if (!fs::exists(src)) {
			std::cout << "[FileReplacer] Source directory does not exist, skipping: "
					  << UpdateConfig::WtoA(src) << std::endl;
			return true;
		}

		if (!fs::exists(dst)) {
			fs::create_directories(dst);
		}

		fs::copy(src, dst, fs::copy_options::recursive | fs::copy_options::overwrite_existing);
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[FileReplacer] Directory copy failed: " << ex.what() << std::endl;
		return false;
	}
}

bool FileReplacer::ReplaceBundle() {
	std::wstring updateBundleDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::BUNDLE_SUBDIR;
	std::wstring targetDir = UpdateConfig::g_Paths.BUNDLE_DIR;

	if (!fs::exists(updateBundleDir)) {
		std::cout << "[FileReplacer] No Bundle updates in staging. Skipping." << std::endl;
		return true;
	}

	std::cout << "[FileReplacer] Replacing Bundle files..." << std::endl;

	bool ok = true;
	try {
		for (const auto& entry : fs::directory_iterator(updateBundleDir)) {
			if (entry.is_regular_file()) {
				std::wstring filename = entry.path().filename().wstring();

				
				
				if (_wcsicmp(filename.c_str(), UpdateConfig::g_Runtime.updaterExe.c_str()) == 0) {
					std::cout << "[FileReplacer] Skipping AutoUpdater.exe (handled by Service)." << std::endl;
					continue;
				}

				std::wstring targetPath = targetDir + filename;

				if (CopyFileWithRetry(entry.path().wstring(), targetPath, UpdateConfig::FILE_REPLACE_MAX_RETRIES)) {
					std::cout << "[FileReplacer] Replaced " << UpdateConfig::WtoA(filename) << std::endl;
				} else {
					std::cerr << "[FileReplacer] FAILED to replace " << UpdateConfig::WtoA(filename) << std::endl;
					ok = false;
				}
			}
		}
	} catch (const std::exception& ex) {
		std::cerr << "[FileReplacer] Error replacing bundle files: " << ex.what() << std::endl;
		ok = false;
	}

	return ok;
}

bool FileReplacer::ReplaceLAI() {
	std::wstring updateLAIDir = UpdateConfig::g_Paths.UPDATE_DIR + UpdateConfig::LAI_SUBDIR;
	std::wstring targetDir = UpdateConfig::g_Paths.LAI_DIR;

	if (!fs::exists(updateLAIDir)) {
		std::cout << "[FileReplacer] No LAI updates in staging. Skipping." << std::endl;
		return true;
	}

	std::cout << "[FileReplacer] Replacing LAI files..." << std::endl;
	return CopyDirectoryContents(updateLAIDir, targetDir);
}

bool FileReplacer::CleanupStaging() {
	try {
		if (fs::exists(UpdateConfig::g_Paths.UPDATE_DIR)) {
			fs::remove_all(UpdateConfig::g_Paths.UPDATE_DIR);
			std::cout << "[FileReplacer] Update staging directory cleaned up." << std::endl;
		}
		return true;
	} catch (const std::exception& ex) {
		std::cerr << "[FileReplacer] Staging cleanup failed: " << ex.what() << std::endl;
		return false;
	}
}

