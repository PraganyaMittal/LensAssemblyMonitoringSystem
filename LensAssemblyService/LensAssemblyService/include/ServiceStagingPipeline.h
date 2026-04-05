#pragma once

// ServiceStagingPipeline — Downloads package from shared path, verifies hash, extracts to staging.
// This replaces the agent's StagingPipeline — service is now responsible for staging.

#include <string>

struct ServiceConfig;
class ServiceHttpClient;

struct DeployRequest {
	std::string type;        // "DeployBundle", "DeployLAI", "RollbackBundle", "RollbackLAI"
	int commandId = 0;
	std::string sharedPath;
	std::string packageName;
	std::string version;
	std::string fileHash;
	bool isRollback = false;
};

class ServiceStagingPipeline {
public:
	ServiceStagingPipeline(const ServiceConfig& config, ServiceHttpClient* httpClient);

	// Execute the full staging pipeline: copy → verify → extract
	bool Execute(const DeployRequest& request);

private:
	bool CopyFromSharedPath(const DeployRequest& req, std::wstring& localPath);
	bool VerifyHash(const std::wstring& filePath, const std::string& expectedHash);
	bool ExtractPackage(const std::wstring& zipPath, const std::wstring& targetDir);
	bool HandleRollback(const DeployRequest& req);
	void ReportProgress(int commandId, const std::string& status, const std::string& message);

	const ServiceConfig& config_;
	ServiceHttpClient* httpClient_;
};
