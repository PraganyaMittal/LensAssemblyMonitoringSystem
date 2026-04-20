#include "pch.h"
#include "ServiceStagingPipeline.h"
#include "ServiceConfig.h"
#include "ServiceHttpClient.h"
#include "ServiceLogger.h"
#include <fstream>
#include <filesystem>

// For SHA-256 hash
#include <wincrypt.h>
#pragma comment(lib, "Crypt32.lib")

// For network share authentication
#include <Winnetwk.h>
#pragma comment(lib, "Mpr.lib")

namespace fs = std::filesystem;

ServiceStagingPipeline::ServiceStagingPipeline(const ServiceConfig& config, ServiceHttpClient* httpClient)
	: config_(config), httpClient_(httpClient) {}



static std::string ComputeSHA256(const std::wstring& filePath) {
	HCRYPTPROV hProv = 0;
	HCRYPTHASH hHash = 0;
	std::string result;

	if (!CryptAcquireContextW(&hProv, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
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
		DWORD bytesRead = (DWORD)file.gcount();
		if (!CryptHashData(hHash, (BYTE*)buffer, bytesRead, 0)) {
			CryptDestroyHash(hHash);
			CryptReleaseContext(hProv, 0);
			return "";
		}
	}

	DWORD hashLen = 32;
	BYTE hashBytes[32];
	if (CryptGetHashParam(hHash, HP_HASHVAL, hashBytes, &hashLen, 0)) {
		char hex[3];
		for (DWORD i = 0; i < hashLen; i++) {
			sprintf_s(hex, "%02x", hashBytes[i]);
			result += hex;
		}
	}

	CryptDestroyHash(hHash);
	CryptReleaseContext(hProv, 0);
	return result;
}



bool ServiceStagingPipeline::Execute(const DeployRequest& req) {
	PIPE_LOG_INFO("[Staging] Starting staging pipeline for " << req.type
		<< " v" << req.version << " (CommandID: " << req.commandId << ")");

	// Determine staging target directory
	bool isBundle = (req.type.find("Bundle") != std::string::npos);
	std::wstring targetSubdir = isBundle ? L"update\\Bundle\\" : L"update\\LAI\\";
	std::wstring targetDir = config_.baseDir + targetSubdir;

	// Handle rollback separately (copy from backup to staging)
	if (req.isRollback) {
		return HandleRollback(req);
	}

	// 1. Ensure staging directory exists
	try {
		fs::create_directories(targetDir);
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Failed to create staging dir: " << ex.what());
		ReportProgress(req.commandId, "Failed", "Failed to create staging directory");
		return false;
	}

	// 2. Copy from shared path
	ReportProgress(req.commandId, "Downloading", "Copying package from shared path...");
	std::wstring localPath;
	if (!CopyFromSharedPath(req, localPath)) {
		ReportProgress(req.commandId, "Failed", "Failed to copy package from shared path");
		return false;
	}

	// 3. Verify hash (if provided)
	if (!req.fileHash.empty()) {
		ReportProgress(req.commandId, "Downloading", "Verifying package integrity...");
		if (!VerifyHash(localPath, req.fileHash)) {
			ReportProgress(req.commandId, "Failed", "Hash verification failed");
			try { fs::remove(localPath); } catch (...) {}
			return false;
		}
		PIPE_LOG_INFO("[Staging] Hash verified successfully.");
	}

	// 4. Extract zip to staging
	ReportProgress(req.commandId, "Installing", "Extracting package to staging...");
	if (!ExtractPackage(localPath, targetDir)) {
		ReportProgress(req.commandId, "Failed", "Package extraction failed");
		return false;
	}

	// 5. Clean up downloaded zip
	try { fs::remove(localPath); } catch (...) {}

	PIPE_LOG_INFO("[Staging] Staging pipeline complete for " << req.type);
	ReportProgress(req.commandId, "Installing", "Staging complete. Spawning updater...");
	return true;
}

bool ServiceStagingPipeline::CopyFromSharedPath(const DeployRequest& req, std::wstring& localPath) {
	if (req.sharedPath.empty() || req.packageName.empty()) {
		PIPE_LOG_ERROR("[Staging] Missing sharedPath or packageName.");
		return false;
	}

	std::wstring sourcePath = ServiceConfig::AtoW(req.sharedPath);
	if (!sourcePath.empty() && sourcePath.back() != L'\\') sourcePath += L'\\';
	sourcePath += ServiceConfig::AtoW(req.packageName);

	// Authenticate to the network share if credentials are provided
	NETRESOURCEW nr;
	ZeroMemory(&nr, sizeof(nr));
	nr.dwType = RESOURCETYPE_DISK;

	std::wstring remoteShare = ServiceConfig::AtoW(req.sharedPath);
	size_t thirdSlash = remoteShare.find(L'\\', 2);
	if (thirdSlash != std::wstring::npos) {
		size_t fourthSlash = remoteShare.find(L'\\', thirdSlash + 1);
		if (fourthSlash != std::wstring::npos) {
			remoteShare = remoteShare.substr(0, fourthSlash);
		}
	}
	nr.lpRemoteName = const_cast<LPWSTR>(remoteShare.c_str());

	if (!req.shareUser.empty()) {
		std::wstring wUser = ServiceConfig::AtoW(req.shareUser);
		std::wstring wPass = ServiceConfig::AtoW(req.sharePass);

		DWORD dwResult = WNetAddConnection2W(&nr, wPass.c_str(), wUser.c_str(), 0);
		if (dwResult != NO_ERROR && dwResult != ERROR_ALREADY_ASSIGNED) {
			PIPE_LOG_ERROR("[Staging] Network share authentication FAILED. Code: " << dwResult);
			ReportProgress(req.commandId, "Failed", "Network share authentication failed (code " + std::to_string(dwResult) + "). Check credentials.");
			return false;
		}
		PIPE_LOG_INFO("[Staging] Authenticated to network share " << ServiceConfig::WtoA(remoteShare));
	} else {
		PIPE_LOG_INFO("[Staging] No share credentials provided. Attempting access without authentication.");
	}

	try {
		if (!fs::exists(sourcePath)) {
			PIPE_LOG_ERROR("[Staging] Package not found at shared path: " << ServiceConfig::WtoA(sourcePath));
			return false;
		}
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Failed to access shared path: " << ex.what());
		return false;
	}

	// Copy to a temp location in the update directory
	std::wstring tempDir = config_.baseDir + L"update\\temp\\";

	try {
		fs::create_directories(tempDir);
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Failed to create temp dir: " << ex.what());
		return false;
	}

	localPath = tempDir + ServiceConfig::AtoW(req.packageName);

	PIPE_LOG_INFO("[Staging] Copying from: " << ServiceConfig::WtoA(sourcePath));
	PIPE_LOG_INFO("[Staging] Copying to:   " << ServiceConfig::WtoA(localPath));

	try {
		fs::copy_file(sourcePath, localPath, fs::copy_options::overwrite_existing);
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] File copy failed: " << ex.what());
		return false;
	}

	// Verify the file was copied and has content
	try {
		auto fileSize = fs::file_size(localPath);
		if (fileSize == 0) {
			PIPE_LOG_ERROR("[Staging] Copied file is empty (0 bytes).");
			return false;
		}
		PIPE_LOG_INFO("[Staging] Package copied. Size: " << fileSize << " bytes");
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Failed to verify copied file: " << ex.what());
		return false;
	}

	return true;
}

bool ServiceStagingPipeline::VerifyHash(const std::wstring& filePath, const std::string& expectedHash) {
	std::string actualHash = ComputeSHA256(filePath);
	if (actualHash.empty()) {
		PIPE_LOG_ERROR("[Staging] Failed to compute hash.");
		return false;
	}

	// Case-insensitive comparison
	std::string expectedLower = expectedHash;
	std::transform(expectedLower.begin(), expectedLower.end(), expectedLower.begin(), ::tolower);
	std::transform(actualHash.begin(), actualHash.end(), actualHash.begin(), ::tolower);

	if (actualHash != expectedLower) {
		PIPE_LOG_ERROR("[Staging] Hash mismatch! Expected: " << expectedLower << ", Got: " << actualHash);
		return false;
	}

	return true;
}

bool ServiceStagingPipeline::ExtractPackage(const std::wstring& zipPath, const std::wstring& targetDir) {
	// Use Shell API for zip extraction (available on all Windows versions)
	// This is the same approach as the agent side

	try {
		// Ensure target dir exists
		fs::create_directories(targetDir);
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Failed to create target dir: " << ex.what());
		return false;
	}

	// Use PowerShell for reliable zip extraction (simpler than Shell API in service context)
	std::wstring psCmd = L"powershell.exe -NoProfile -Command \"Expand-Archive -Path '";
	psCmd += zipPath;
	psCmd += L"' -DestinationPath '";
	psCmd += targetDir;
	psCmd += L"' -Force\"";

	STARTUPINFOW si = {};
	si.cb = sizeof(si);
	PROCESS_INFORMATION pi = {};

	std::vector<wchar_t> cmdBuf(psCmd.begin(), psCmd.end());
	cmdBuf.push_back(L'\0');

	BOOL ok = CreateProcessW(
		NULL, cmdBuf.data(), NULL, NULL, FALSE,
		CREATE_NO_WINDOW, NULL, NULL, &si, &pi
	);

	if (!ok) {
		PIPE_LOG_ERROR("[Staging] Failed to start extraction process. Error: " << GetLastError());
		return false;
	}

	// Wait for extraction to complete (timeout: 5 minutes)
	DWORD waitResult = WaitForSingleObject(pi.hProcess, 300000);
	DWORD exitCode = 1;
	GetExitCodeProcess(pi.hProcess, &exitCode);

	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);

	if (waitResult == WAIT_TIMEOUT) {
		PIPE_LOG_ERROR("[Staging] Extraction timed out after 5 minutes.");
		return false;
	}

	if (exitCode != 0) {
		PIPE_LOG_ERROR("[Staging] Extraction failed. Exit code: " << exitCode);
		return false;
	}

	// --- ZIP Flattening Logic ---
	// If the user accidentally zipped the folder itself instead of the files inside,
	// the extraction will result in exactly 1 directory and 0 files at the root.
	// We detect this and move the contents up one level.
	try {
		int fileCount = 0;
		int dirCount = 0;
		fs::path singleSubdir;

		for (const auto& entry : fs::directory_iterator(targetDir)) {
			if (entry.is_regular_file()) {
				fileCount++;
			} else if (entry.is_directory()) {
				dirCount++;
				singleSubdir = entry.path();
			}
		}

		if (fileCount == 0 && dirCount == 1) {
			PIPE_LOG_INFO("[Staging] Detected ZIP with wrapper folder ('" 
				<< ServiceConfig::WtoA(singleSubdir.filename().wstring()) 
				<< "'). Flattening directory structure...");

			for (const auto& entry : fs::directory_iterator(singleSubdir)) {
				fs::path destPath = fs::path(targetDir) / entry.path().filename();
				fs::rename(entry.path(), destPath);
			}

			fs::remove(singleSubdir);
			PIPE_LOG_INFO("[Staging] Directory flattened successfully.");
		}
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Warning: Error while checking/flattening zip structure: " << ex.what());
	}

	PIPE_LOG_INFO("[Staging] Package extracted to: " << ServiceConfig::WtoA(targetDir));
	return true;
}

bool ServiceStagingPipeline::HandleRollback(const DeployRequest& req) {
	PIPE_LOG_INFO("[Staging] Handling rollback for " << req.type);

	bool isBundle = (req.type.find("Bundle") != std::string::npos);
	std::wstring targetSubdir = isBundle ? L"update\\Bundle\\" : L"update\\LAI\\";
	std::wstring targetDir = config_.baseDir + targetSubdir;

	// Single backup source — backup_preserved is eliminated
	std::wstring backupSubdir = isBundle ? L"backup\\Bundle\\" : L"backup\\LAI\\";
	std::wstring backupDir = config_.baseDir + backupSubdir;

	// Validate backup exists
	if (!fs::exists(backupDir) || fs::is_empty(backupDir)) {
		PIPE_LOG_ERROR("[Staging] No backup found for rollback at: " << ServiceConfig::WtoA(backupDir));
		ReportProgress(req.commandId, "Failed", "No backup found for rollback");
		return false;
	}

	// Validate backup manifest exists (written by AutoUpdater's BackupManager)
	std::wstring manifestPath = backupDir + L"backup_manifest.json";
	if (!fs::exists(manifestPath)) {
		PIPE_LOG_INFO("[Staging] Warning: backup_manifest.json not found. Proceeding with unverified backup.");
	} else {
		PIPE_LOG_INFO("[Staging] Backup manifest found. Backup is verified.");
	}

	ReportProgress(req.commandId, "Installing", "Copying backup to staging...");

	// Copy backup → staging directory
	try {
		if (fs::exists(targetDir)) {
			fs::remove_all(targetDir);
		}
		fs::create_directories(targetDir);
		fs::copy(backupDir, targetDir, fs::copy_options::recursive | fs::copy_options::overwrite_existing);
	} catch (const std::exception& ex) {
		PIPE_LOG_ERROR("[Staging] Rollback staging failed: " << ex.what());
		ReportProgress(req.commandId, "Failed", "Rollback staging failed");
		return false;
	}

	PIPE_LOG_INFO("[Staging] Rollback staging complete.");
	ReportProgress(req.commandId, "Installing", "Rollback staged. Spawning updater...");
	return true;
}

void ServiceStagingPipeline::ReportProgress(int commandId, const std::string& status, const std::string& message) {
	if (httpClient_ && commandId > 0) {
		httpClient_->ReportCommandProgress(commandId, status, message);
	}
	PIPE_LOG_INFO("[Staging] Progress: [" << status << "] " << message);
}
