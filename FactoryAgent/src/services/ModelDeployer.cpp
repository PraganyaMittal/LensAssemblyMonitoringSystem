#include "../include/services/ModelDeployer.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/FileUtils.h"
#include "../include/utilities/ZipUtils.h"
#include "../include/common/Constants.h"
#include "../include/Utils/Logger.h"
#include <windows.h>
#include <wincrypt.h>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <ctime>

#pragma comment(lib, "Advapi32.lib")

ModelDeployer::ModelDeployer(AgentSettings* settings, HttpClient* client)
    : settings_(settings), httpClient_(client) {
}

ModelDeployer::~ModelDeployer() {
}

DeployResult ModelDeployer::DeployModel(const DeployRequest& request) {
    std::lock_guard<std::mutex> lock(deployMutex_);

    DeployResult result;

    FactoryAgent::Utils::Logger::Info(
        "[ModelDeployer] Starting deployment of model: " + request.modelName);

    
    char tempPathBuf[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPathBuf);
    std::string tempDir = std::string(tempPathBuf) + "FactoryAgentDeploy";
    FileUtils::CreateFolder(tempDir);
    std::string tempZipPath = tempDir + "\\" + request.modelName + ".zip";

    if (!DownloadToTemp(request.downloadUrl, tempZipPath)) {
        result.errorMessage = "Failed to download model from server";
        FactoryAgent::Utils::Logger::Error(
            "[ModelDeployer] Download failed for: " + request.modelName);
        return result;
    }

    
    result.agentChecksum = ComputeSHA256(tempZipPath);

    
    if (!request.expectedChecksum.empty() && !result.agentChecksum.empty()) {
        if (result.agentChecksum != request.expectedChecksum) {
            FactoryAgent::Utils::Logger::Error(
                "[ModelDeployer] Checksum mismatch for " + request.modelName +
                " expected=" + request.expectedChecksum +
                " got=" + result.agentChecksum);
            result.errorMessage = "Integrity check failed: checksum mismatch";
            FileUtils::DeleteFile(tempZipPath);
            return result;
        }
        FactoryAgent::Utils::Logger::Info(
            "[ModelDeployer] Checksum verified OK for: " + request.modelName);
    }

    
    std::string stagingDir = settings_->modelFolderPath + "\\" +
                             request.modelName + "_staging_" + GetTimestamp();
    FileUtils::CreateFolder(stagingDir);

    if (!ExtractToStaging(tempZipPath, stagingDir)) {
        result.errorMessage = "Failed to extract model archive";
        FactoryAgent::Utils::Logger::Error(
            "[ModelDeployer] Extraction failed for: " + request.modelName);
        FileUtils::DeleteFolder(stagingDir);
        FileUtils::DeleteFile(tempZipPath);
        return result;
    }

    
    std::string targetDir = settings_->modelFolderPath + "\\" + request.modelName;

    if (!AtomicSwap(stagingDir, targetDir)) {
        result.errorMessage = "Failed to swap model directories";
        FactoryAgent::Utils::Logger::Error(
            "[ModelDeployer] Atomic swap failed for: " + request.modelName);
        FileUtils::DeleteFolder(stagingDir);
        FileUtils::DeleteFile(tempZipPath);
        return result;
    }

    
    FileUtils::DeleteFile(tempZipPath);

    result.success = true;
    result.extractPath = targetDir;
    FactoryAgent::Utils::Logger::Info(
        "[ModelDeployer] Deployment completed successfully: " + request.modelName);

    return result;
}

bool ModelDeployer::DownloadToTemp(const std::string& url, const std::string& tempPath) {
    if (!httpClient_) return false;
    return httpClient_->DownloadFile(url, tempPath);
}

bool ModelDeployer::ExtractToStaging(const std::string& zipPath, const std::string& stagingDir) {
    return ZipUtils::ExtractZip(zipPath, stagingDir);
}

bool ModelDeployer::AtomicSwap(const std::string& stagingDir, const std::string& targetDir) {
    std::string backupDir = targetDir + "_backup_" + GetTimestamp();

    
    if (FileUtils::FolderExists(targetDir)) {
        if (!MoveFileExA(targetDir.c_str(), backupDir.c_str(), 0)) {
            FactoryAgent::Utils::Logger::Error(
                "[ModelDeployer] Failed to move current model to backup: " + targetDir);
            return false;
        }
    }

    
    if (!MoveFileExA(stagingDir.c_str(), targetDir.c_str(), 0)) {
        
        FactoryAgent::Utils::Logger::Error(
            "[ModelDeployer] Failed to move staging to target. Rolling back.");
        if (FileUtils::FolderExists(backupDir)) {
            MoveFileExA(backupDir.c_str(), targetDir.c_str(), 0);
        }
        return false;
    }

    
    
    if (FileUtils::FolderExists(backupDir)) {
        FileUtils::DeleteFolder(backupDir);
    }

    return true;
}

bool ModelDeployer::Rollback(const std::string& backupDir, const std::string& targetDir) {
    if (!FileUtils::FolderExists(backupDir)) return false;

    
    if (FileUtils::FolderExists(targetDir)) {
        FileUtils::DeleteFolder(targetDir);
    }

    return MoveFileExA(backupDir.c_str(), targetDir.c_str(), 0) != 0;
}

std::string ModelDeployer::ComputeSHA256(const std::string& filePath) {
    HCRYPTPROV hProv = 0;
    HCRYPTHASH hHash = 0;
    std::string result;

    if (!CryptAcquireContext(&hProv, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
        return "";
    }

    if (!CryptCreateHash(hProv, CALG_SHA_256, 0, 0, &hHash)) {
        CryptReleaseContext(hProv, 0);
        return "";
    }

    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        CryptDestroyHash(hHash);
        CryptReleaseContext(hProv, 0);
        return "";
    }

    char buffer[8192];
    while (file.read(buffer, sizeof(buffer)) || file.gcount() > 0) {
        DWORD bytesRead = static_cast<DWORD>(file.gcount());
        if (!CryptHashData(hHash, reinterpret_cast<const BYTE*>(buffer), bytesRead, 0)) {
            CryptDestroyHash(hHash);
            CryptReleaseContext(hProv, 0);
            return "";
        }
    }
    file.close();

    BYTE hashValue[32]; 
    DWORD hashLen = 32;
    if (CryptGetHashParam(hHash, HP_HASHVAL, hashValue, &hashLen, 0)) {
        std::ostringstream oss;
        for (DWORD i = 0; i < hashLen; i++) {
            oss << std::hex << std::setw(2) << std::setfill('0')
                << static_cast<int>(hashValue[i]);
        }
        result = oss.str();
    }

    CryptDestroyHash(hHash);
    CryptReleaseContext(hProv, 0);
    return result;
}

std::string ModelDeployer::GetTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    struct tm tm_buf;
    localtime_s(&tm_buf, &time_t);
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &tm_buf);
    return std::string(buf);
}
