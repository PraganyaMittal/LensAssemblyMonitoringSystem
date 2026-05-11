#pragma once

// ============================================================================
// RemoteReporter.h — HTTP command result reporting for ServiceSetup
// ============================================================================
// Extracted from main.cpp. Handles WinHTTP-based POST to the server API
// for reporting decommission/uninstall results back to the monitoring system.
// Uses raw WinHTTP (no dependencies on third-party HTTP libs).
// ============================================================================

#include <windows.h>
#include <winhttp.h>
#include <string>

#pragma comment(lib, "winhttp.lib")

namespace RemoteReporter {

	/// Escape a string for safe JSON embedding.
	inline std::string JsonEscape(const std::string& value) {
		std::string escaped;
		escaped.reserve(value.size());
		for (char ch : value) {
			switch (ch) {
			case '\\': escaped += "\\\\"; break;
			case '"': escaped += "\\\""; break;
			case '\n': escaped += "\\n"; break;
			case '\r': escaped += "\\r"; break;
			case '\t': escaped += "\\t"; break;
			default: escaped += ch; break;
			}
		}
		return escaped;
	}

	/// Build the command result endpoint URL from a server base URL.
	inline std::wstring BuildEndpointUrl(std::wstring serverUrl) {
		while (!serverUrl.empty() && serverUrl.back() == L'/') serverUrl.pop_back();
		return serverUrl + L"/api/agent/commandresult";
	}

	/// POST a command result to the server API.
	/// Returns true if the server responded with 2xx status.
	inline bool ReportCommandResult(
		const std::wstring& serverUrl,
		int commandId,
		const std::string& status,
		const std::string& resultData,
		const std::string& errorMessage) {

		if (serverUrl.empty() || commandId <= 0) return false;

		std::wstring url = BuildEndpointUrl(serverUrl);

		URL_COMPONENTS components = {};
		components.dwStructSize = sizeof(components);
		components.dwSchemeLength = (DWORD)-1;
		components.dwHostNameLength = (DWORD)-1;
		components.dwUrlPathLength = (DWORD)-1;
		components.dwExtraInfoLength = (DWORD)-1;

		if (!WinHttpCrackUrl(url.c_str(), 0, 0, &components)) {
			return false;
		}

		std::wstring host(components.lpszHostName, components.dwHostNameLength);
		std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
		if (components.dwExtraInfoLength > 0) {
			path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
		}

		bool useHttps = components.nScheme == INTERNET_SCHEME_HTTPS;
		INTERNET_PORT port = components.nPort;

		std::string body = "{";
		body += "\"commandId\":" + std::to_string(commandId) + ",";
		body += "\"status\":\"" + JsonEscape(status) + "\",";
		body += "\"resultData\":\"" + JsonEscape(resultData) + "\",";
		body += "\"errorMessage\":";
		if (errorMessage.empty()) {
			body += "null";
		} else {
			body += "\"" + JsonEscape(errorMessage) + "\"";
		}
		body += "}";

		HINTERNET session = WinHttpOpen(
			L"LensAssemblyServiceSetup/1.0",
			WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
			WINHTTP_NO_PROXY_NAME,
			WINHTTP_NO_PROXY_BYPASS,
			0);
		if (!session) return false;

		WinHttpSetTimeouts(session, 5000, 5000, 5000, 15000);
		HINTERNET connect = WinHttpConnect(session, host.c_str(), port, 0);
		if (!connect) {
			WinHttpCloseHandle(session);
			return false;
		}

		DWORD flags = useHttps ? WINHTTP_FLAG_SECURE : 0;
		HINTERNET request = WinHttpOpenRequest(
			connect,
			L"POST",
			path.c_str(),
			NULL,
			WINHTTP_NO_REFERER,
			WINHTTP_DEFAULT_ACCEPT_TYPES,
			flags);
		if (!request) {
			WinHttpCloseHandle(connect);
			WinHttpCloseHandle(session);
			return false;
		}

		std::wstring headers = L"Content-Type: application/json\r\n";
		BOOL sent = WinHttpSendRequest(
			request,
			headers.c_str(),
			(DWORD)-1L,
			(LPVOID)body.data(),
			(DWORD)body.size(),
			(DWORD)body.size(),
			0);

		bool ok = false;
		if (sent && WinHttpReceiveResponse(request, NULL)) {
			DWORD statusCode = 0;
			DWORD statusSize = sizeof(statusCode);
			if (WinHttpQueryHeaders(
					request,
					WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
					WINHTTP_HEADER_NAME_BY_INDEX,
					&statusCode,
					&statusSize,
					WINHTTP_NO_HEADER_INDEX)) {
				ok = statusCode >= 200 && statusCode < 300;
			}
		}

		WinHttpCloseHandle(request);
		WinHttpCloseHandle(connect);
		WinHttpCloseHandle(session);
		return ok;
	}

} // namespace RemoteReporter
