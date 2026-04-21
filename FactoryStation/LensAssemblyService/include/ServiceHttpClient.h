#pragma once

// ServiceHttpClient — Lightweight HTTP client for the service to push progress to the web server.
// Uses WinHTTP for REST API calls. Service only PUSHes, never receives commands.

#include <windows.h>
#include <string>

class ServiceHttpClient {
public:
	explicit ServiceHttpClient(const std::wstring& serverUrl);
	~ServiceHttpClient();

	// Report command progress to web server (uses /api/agent/commandresult endpoint)
	bool ReportCommandProgress(int commandId, const std::string& status,
	                           const std::string& resultData, const std::string& errorMessage = "");

private:
	bool PostJson(const std::wstring& endpoint, const std::string& jsonBody);

	std::wstring serverUrl_;
	std::wstring hostname_;
	WORD port_ = 80;
	bool useHttps_ = false;
};
