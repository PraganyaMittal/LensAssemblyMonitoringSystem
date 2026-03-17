#include "FileReplacer.h"
#include "UpdateConfig.h"
#include <iostream>
#include <filesystem>
#include <thread>
#include <chrono>

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
            std::cout << "[FileReplacer] Source directory does not exist, skipping: ";
            std::wcout << src << std::endl;
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

bool FileReplacer::ReplaceCore() {
    std::wstring updateCoreDir = std::wstring(UpdateConfig::UPDATE_DIR) + UpdateConfig::CORE_SUBDIR;
    std::wstring targetDir = UpdateConfig::CORE_DIR;

    if (!fs::exists(updateCoreDir)) {
        std::cout << "[FileReplacer] No Core updates in staging. Skipping." << std::endl;
        return true;
    }

    std::cout << "[FileReplacer] Replacing Core files..." << std::endl;

    // All processes (Agent, Service) are stopped at this point.
    // AutoUpdater.exe was already updated by UpdateSpawner and removed from staging.
    // Simply copy every remaining file from update\Core\ to Core\.
    bool ok = true;
    try {
        for (const auto& entry : fs::directory_iterator(updateCoreDir)) {
            if (entry.is_regular_file()) {
                std::wstring filename = entry.path().filename().wstring();
                std::wstring targetPath = targetDir + filename;

                if (CopyFileWithRetry(entry.path().wstring(), targetPath, UpdateConfig::FILE_REPLACE_MAX_RETRIES)) {
                    std::wcout << L"[FileReplacer] Replaced " << filename << std::endl;
                } else {
                    std::wcerr << L"[FileReplacer] FAILED to replace " << filename << std::endl;
                    ok = false;
                }
            }
        }
    } catch (const std::exception& ex) {
        std::cerr << "[FileReplacer] Error replacing core files: " << ex.what() << std::endl;
        ok = false;
    }

    return ok;
}

bool FileReplacer::ReplaceLAI() {
    std::wstring updateLAIDir = std::wstring(UpdateConfig::UPDATE_DIR) + UpdateConfig::LAI_SUBDIR;
    std::wstring targetDir = UpdateConfig::LAI_DIR;

    if (!fs::exists(updateLAIDir)) {
        std::cout << "[FileReplacer] No LAI updates in staging. Skipping." << std::endl;
        return true;
    }

    std::cout << "[FileReplacer] Replacing LAI files..." << std::endl;
    return CopyDirectoryContents(updateLAIDir, targetDir);
}
