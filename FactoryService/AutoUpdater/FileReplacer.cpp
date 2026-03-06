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

    bool ok = true;

    // Replace Agent.exe if present in staging
    std::wstring agentSrc = updateCoreDir + UpdateConfig::AGENT_EXE;
    if (fs::exists(agentSrc)) {
        std::wstring agentDst = targetDir + UpdateConfig::AGENT_EXE;
        if (CopyFileWithRetry(agentSrc, agentDst, UpdateConfig::FILE_REPLACE_MAX_RETRIES)) {
            std::cout << "[FileReplacer] Replaced Agent.exe" << std::endl;
        } else {
            std::cerr << "[FileReplacer] FAILED to replace Agent.exe" << std::endl;
            ok = false;
        }
    }

    // Replace FactoryService.exe if present in staging
    std::wstring svcSrc = updateCoreDir + UpdateConfig::SERVICE_EXE;
    if (fs::exists(svcSrc)) {
        std::wstring svcDst = targetDir + UpdateConfig::SERVICE_EXE;
        if (CopyFileWithRetry(svcSrc, svcDst, UpdateConfig::FILE_REPLACE_MAX_RETRIES)) {
            std::cout << "[FileReplacer] Replaced FactoryService.exe" << std::endl;
        } else {
            std::cerr << "[FileReplacer] FAILED to replace FactoryService.exe" << std::endl;
            ok = false;
        }
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
