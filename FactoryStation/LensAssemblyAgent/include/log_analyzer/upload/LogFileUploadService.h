#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <string>

using json = nlohmann::json;

class RestClient;





class LogFileUploadService {
public:
	LogFileUploadService(AgentSettings* settings, RestClient* client);
	~LogFileUploadService() = default;

	LogFileUploadService(const LogFileUploadService&) = delete;
	LogFileUploadService& operator=(const LogFileUploadService&) = delete;

	
	
	void UploadRequestedFile(const std::string& filePath, const std::string& requestId);

private:
	bool UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
		const std::wstring& endpoint, const std::string& pcIdStr);

	
	AgentSettings* settings_;
	RestClient* httpClient_;
};
