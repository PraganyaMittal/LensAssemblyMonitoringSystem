#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <string>

using json = nlohmann::json;

class RestClient;

/// @brief Handles on-demand filtered log file uploads.
///        Triggered by SignalR UPLOAD_LOG commands from the server.
///        Reads log files line-by-line, filters for graph-relevant events,
///        compresses via GZip, and uploads to the backend.
class LogFileUploadService {
public:
	LogFileUploadService(AgentSettings* settings, RestClient* client);
	~LogFileUploadService() = default;

	LogFileUploadService(const LogFileUploadService&) = delete;
	LogFileUploadService& operator=(const LogFileUploadService&) = delete;

	/// Uploads a filtered version of the log file at the given path.
	/// Called when the server requests a specific log file via SignalR.
	void UploadRequestedFile(const std::string& filePath, const std::string& requestId);

private:
	bool UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
		const std::wstring& endpoint, const std::string& pcIdStr);

	// Raw pointers (non-owning)
	AgentSettings* settings_;
	RestClient* httpClient_;
};
