#include "pch.h"
#include "ServiceHttpClient.h"
#include "ServiceLogger.h"
#include <winhttp.h>
#include <sstream>

#pragma comment(lib, "Winhttp.lib")

ServiceHttpClient::ServiceHttpClient(const std::wstring& serverUrl) : serverUrl_(serverUrl) {
	// Parse server URL to extract hostname, port, and https flag
	// Expected format: "http://192.168.1.100:5000" or "https://server.com"
	std::wstring url = serverUrl;

	if (url.find(L"https://") == 0) {
		useHttps_ = true;
		url = url.substr(8);
	} else if (url.find(L"http://") == 0) {
		useHttps_ = false;
		url = url.substr(7);
	}

	// Remove trailing slash
	while (!url.empty() && url.back() == L'/') url.pop_back();

	// Split host:port
	size_t colonPos = url.find(L':');
	if (colonPos != std::wstring::npos) {
		hostname_ = url.substr(0, colonPos);
		try {
			port_ = (WORD)std::stoi(url.substr(colonPos + 1));
		} catch (...) {
			port_ = useHttps_ ? 443 : 80;
		}
	} else {
		hostname_ = url;
		port_ = useHttps_ ? 443 : 80;
	}

	PIPE_LOG_INFO("[HttpClient] Initialized: " << (useHttps_ ? "https" : "http")
		<< "://" << std::string(hostname_.begin(), hostname_.end()) << ":" << port_);
}

ServiceHttpClient::~ServiceHttpClient() {}

bool ServiceHttpClient::ReportCommandProgress(int commandId, const std::string& status,
                                              const std::string& resultData, const std::string& errorMessage) {
	// Build JSON payload matching the existing /api/agent/commandresult endpoint format
	std::ostringstream json;
	json << "{";
	json << "\"commandId\":" << commandId << ",";
	json << "\"status\":\"" << status << "\",";
	json << "\"resultData\":\"" << resultData << "\",";
	json << "\"errorMessage\":\"" << errorMessage << "\"";
	json << "}";

	bool ok = PostJson(L"/api/agent/commandresult", json.str());
	if (!ok) {
		PIPE_LOG_ERROR("[HttpClient] Failed to report progress for command " << commandId);
	}
	return ok;
}

bool ServiceHttpClient::PostJson(const std::wstring& endpoint, const std::string& jsonBody) {
	if (hostname_.empty()) {
		PIPE_LOG_ERROR("[HttpClient] No server configured.");
		return false;
	}

	HINTERNET hSession = WinHttpOpen(L"LensAssemblyService/1.0",
		WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
		WINHTTP_NO_PROXY_NAME,
		WINHTTP_NO_PROXY_BYPASS, 0);
	if (!hSession) return false;

	HINTERNET hConnect = WinHttpConnect(hSession, hostname_.c_str(),
		(INTERNET_PORT)port_, 0);
	if (!hConnect) {
		WinHttpCloseHandle(hSession);
		return false;
	}

	DWORD flags = useHttps_ ? WINHTTP_FLAG_SECURE : 0;
	HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST",
		endpoint.c_str(), NULL, WINHTTP_NO_REFERER,
		WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
	if (!hRequest) {
		WinHttpCloseHandle(hConnect);
		WinHttpCloseHandle(hSession);
		return false;
	}

	// Set content type header
	std::wstring headers = L"Content-Type: application/json\r\n";

	// Set timeout (10 seconds)
	DWORD timeout = 10000;
	WinHttpSetOption(hRequest, WINHTTP_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
	WinHttpSetOption(hRequest, WINHTTP_OPTION_SEND_TIMEOUT, &timeout, sizeof(timeout));
	WinHttpSetOption(hRequest, WINHTTP_OPTION_RECEIVE_TIMEOUT, &timeout, sizeof(timeout));

	BOOL ok = WinHttpSendRequest(hRequest,
		headers.c_str(), (DWORD)headers.size(),
		(LPVOID)jsonBody.c_str(), (DWORD)jsonBody.size(),
		(DWORD)jsonBody.size(), 0);

	if (ok) {
		ok = WinHttpReceiveResponse(hRequest, NULL);
	}

	bool success = false;
	if (ok) {
		DWORD statusCode = 0;
		DWORD statusCodeSize = sizeof(statusCode);
		WinHttpQueryHeaders(hRequest,
			WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
			WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusCodeSize, NULL);
		success = (statusCode >= 200 && statusCode < 300);
		if (!success) {
			PIPE_LOG_ERROR("[HttpClient] HTTP " << statusCode << " for POST " 
				<< std::string(endpoint.begin(), endpoint.end()));
		}
	} else {
		PIPE_LOG_ERROR("[HttpClient] Request failed. Error: " << GetLastError());
	}

	WinHttpCloseHandle(hRequest);
	WinHttpCloseHandle(hConnect);
	WinHttpCloseHandle(hSession);
	return success;
}
