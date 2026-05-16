#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <mutex>
#include <curl/curl.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

/// @brief Production-grade HTTP client powered by libcurl.
///        Drop-in replacement for the legacy WinHTTP implementation.
///        Thread-safe, RAII-managed, with automatic retry and connection reuse.
class HttpClient {
public:
	HttpClient(const std::wstring& serverUrl);
	~HttpClient();

	// Disable copy — each instance owns a CURL handle
	HttpClient(const HttpClient&) = delete;
	HttpClient& operator=(const HttpClient&) = delete;

	/// @brief POST JSON data and receive a JSON response.
	bool Post(const std::wstring& endpoint, const json& data, json& response);

	/// @brief GET JSON data from an endpoint.
	bool Get(const std::wstring& endpoint, json& response);

	/// @brief Upload a single file via multipart/form-data with a modelName field.
	bool UploadFile(const std::wstring& endpoint, const std::string& filePath,
		const std::string& modelName, json& response);

	/// @brief Upload pre-compressed (gzip) data via multipart/form-data.
	bool UploadCompressedData(const std::wstring& endpoint, const std::vector<uint8_t>& compressedData,
		const std::string& fileName, const std::string& modelName, size_t originalSize, json& response);

	/// @brief Download a file from a URL to a local path.
	bool DownloadFile(const std::string& url, const std::string& outputPath);

	/// @brief Download a file with HTTP Range resume support.
	bool DownloadFileResumable(const std::string& url, const std::string& outputPath);

	/// @brief Upload multiple files via multipart/form-data.
	bool UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response);

	const std::wstring& GetServerUrl() const { return serverUrl_; }

private:
	// URL components
	std::string baseUrl_;       // Full base URL as UTF-8 (e.g., "http://server:5000")
	std::wstring serverUrl_;    // Original wide-string URL (for GetServerUrl())

	// libcurl shared handle for connection pooling
	CURL* curl_ = nullptr;
	std::mutex curlMutex_;

	// Internal helpers
	std::string BuildFullUrl(const std::wstring& endpoint) const;
	std::string WideToUtf8(const std::wstring& wstr) const;
	std::wstring Utf8ToWide(const std::string& str) const;

	/// @brief Perform a JSON request (GET or POST). Handles retries.
	bool PerformJsonRequest(const std::string& method, const std::string& url,
		const std::string& requestBody, std::string& responseBody);

	/// @brief Perform a multipart upload. Returns the response body.
	bool PerformMultipartUpload(const std::string& url,
		const std::vector<std::pair<std::string, std::string>>& formFields,
		const std::string& fileFieldName, const std::string& fileName,
		const uint8_t* fileData, size_t fileSize,
		const std::string& contentType,
		const std::vector<std::string>& extraHeaders,
		std::string& responseBody);

	/// @brief libcurl write callback — appends data to a std::string.
	static size_t WriteCallback(char* ptr, size_t size, size_t nmemb, void* userdata);

	/// @brief libcurl write callback — writes data to a std::ofstream.
	static size_t WriteFileCallback(char* ptr, size_t size, size_t nmemb, void* userdata);

	/// @brief One-time global curl initialization (thread-safe via std::call_once).
	static void InitCurlGlobal();
	static std::once_flag curlInitFlag_;
};
