#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <mutex>
#include <curl/curl.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;





class RestClient {
public:
	RestClient(const std::wstring& serverUrl);
	~RestClient();

	
	RestClient(const RestClient&) = delete;
	RestClient& operator=(const RestClient&) = delete;

	
	bool Post(const std::wstring& endpoint, const json& data, json& response);

	
	bool Get(const std::wstring& endpoint, json& response);

	
	bool UploadFile(const std::wstring& endpoint, const std::string& filePath,
		const std::string& modelName, json& response);

	
	bool UploadCompressedData(const std::wstring& endpoint, const std::vector<uint8_t>& compressedData,
		const std::string& fileName, const std::string& modelName, size_t originalSize, json& response);

	
	bool DownloadFile(const std::string& url, const std::string& outputPath);

	
	bool UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response);

	const std::wstring& GetServerUrl() const { return serverUrl_; }

private:
	
	std::string baseUrl_;       
	std::wstring serverUrl_;    

	
	CURL* curl_ = nullptr;
	std::mutex curlMutex_;

	
	std::string BuildFullUrl(const std::wstring& endpoint) const;

	
	bool PerformJsonRequest(const std::string& method, const std::string& url,
		const std::string& requestBody, std::string& responseBody);

	
	bool PerformMultipartUpload(const std::string& url,
		const std::vector<std::pair<std::string, std::string>>& formFields,
		const std::string& fileFieldName, const std::string& fileName,
		const uint8_t* fileData, size_t fileSize,
		const std::string& contentType,
		const std::vector<std::string>& extraHeaders,
		std::string& responseBody);

	
	static size_t WriteCallback(char* ptr, size_t size, size_t nmemb, void* userdata);

	
	static size_t WriteFileCallback(char* ptr, size_t size, size_t nmemb, void* userdata);

	
	static void InitCurlGlobal();
	static std::once_flag curlInitFlag_;
};
