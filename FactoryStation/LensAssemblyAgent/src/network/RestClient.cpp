#include "network/RestClient.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include <sstream>
#include <fstream>
#include <filesystem>
#include <random>




std::once_flag RestClient::curlInitFlag_;

void RestClient::InitCurlGlobal() {
	curl_global_init(CURL_GLOBAL_ALL);
	std::atexit([] { curl_global_cleanup(); });
}




size_t RestClient::WriteCallback(char* ptr, size_t size, size_t nmemb, void* userdata) {
	auto* response = static_cast<std::string*>(userdata);
	size_t totalBytes = size * nmemb;
	response->append(ptr, totalBytes);
	return totalBytes;
}

size_t RestClient::WriteFileCallback(char* ptr, size_t size, size_t nmemb, void* userdata) {
	auto* stream = static_cast<std::ofstream*>(userdata);
	size_t totalBytes = size * nmemb;
	stream->write(ptr, totalBytes);
	return stream->good() ? totalBytes : 0;
}




RestClient::RestClient(const std::wstring& serverUrl) : serverUrl_(serverUrl) {
	std::call_once(curlInitFlag_, InitCurlGlobal);

	baseUrl_ = NetworkUtils::ConvertWStringToString(serverUrl);

	
	if (!baseUrl_.empty() && baseUrl_.back() == '/') {
		baseUrl_.pop_back();
	}

	curl_ = curl_easy_init();
	if (!curl_) {
		Logger::Error("RestClient: curl_easy_init() failed");
	}
}

RestClient::~RestClient() {
	if (curl_) {
		curl_easy_cleanup(curl_);
		curl_ = nullptr;
	}
}




std::string RestClient::BuildFullUrl(const std::wstring& endpoint) const {
	std::string ep = NetworkUtils::ConvertWStringToString(endpoint);

	
	if (ep.find("://") != std::string::npos) {
		return ep;
	}

	
	if (!ep.empty() && ep[0] != '/') {
		ep = "/" + ep;
	}

	return baseUrl_ + ep;
}




bool RestClient::PerformJsonRequest(const std::string& method, const std::string& url,
	const std::string& requestBody, std::string& responseBody) {

	std::lock_guard<std::mutex> lock(curlMutex_);

	if (!curl_) {
		curl_ = curl_easy_init();
		if (!curl_) {
			Logger::Error("RestClient::PerformJsonRequest: curl handle is null");
			return false;
		}
	}

	const int MAX_RETRIES = 2;

	for (int attempt = 0; attempt < MAX_RETRIES; ++attempt) {
		curl_easy_reset(curl_);
		responseBody.clear();

		curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
		curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteCallback);
		curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &responseBody);
		curl_easy_setopt(curl_, CURLOPT_USERAGENT, "Factory Agent/1.0");

		
		curl_easy_setopt(curl_, CURLOPT_CONNECTTIMEOUT, 5L);
		curl_easy_setopt(curl_, CURLOPT_TIMEOUT, 30L);

		
		curl_easy_setopt(curl_, CURLOPT_TCP_KEEPALIVE, 1L);

		
		curl_easy_setopt(curl_, CURLOPT_FOLLOWLOCATION, 1L);
		curl_easy_setopt(curl_, CURLOPT_MAXREDIRS, 3L);

		struct curl_slist* headers = nullptr;

		if (method == "POST") {
			curl_easy_setopt(curl_, CURLOPT_POST, 1L);
			curl_easy_setopt(curl_, CURLOPT_POSTFIELDS, requestBody.c_str());
			curl_easy_setopt(curl_, CURLOPT_POSTFIELDSIZE, (long)requestBody.size());
			struct curl_slist* tmp = curl_slist_append(headers, "Content-Type: application/json");
			if (!tmp) {
				Logger::Error("RestClient::PerformJsonRequest: curl_slist_append failed");
				if (headers) curl_slist_free_all(headers);
				return false;
			}
			headers = tmp;
		}

		if (headers) {
			curl_easy_setopt(curl_, CURLOPT_HTTPHEADER, headers);
		}

		CURLcode res = curl_easy_perform(curl_);

		if (headers) {
			curl_slist_free_all(headers);
		}

		if (res != CURLE_OK) {
			Logger::Error("RestClient::" + method + " curl error: " + curl_easy_strerror(res)
				+ " (attempt " + std::to_string(attempt + 1) + "/" + std::to_string(MAX_RETRIES) + ")"
				+ " URL: " + url);

			
			if (attempt < MAX_RETRIES - 1 &&
				(res == CURLE_COULDNT_CONNECT || res == CURLE_OPERATION_TIMEDOUT ||
				 res == CURLE_GOT_NOTHING || res == CURLE_SEND_ERROR || res == CURLE_RECV_ERROR)) {
				continue;
			}
			return false;
		}

		long httpCode = 0;
		curl_easy_getinfo(curl_, CURLINFO_RESPONSE_CODE, &httpCode);

		if (httpCode >= 200 && httpCode < 300) {
			return true;
		}

		Logger::Error("RestClient::" + method + " HTTP " + std::to_string(httpCode) + " URL: " + url);
		return false;
	}

	return false;
}




bool RestClient::PerformMultipartUpload(const std::string& url,
	const std::vector<std::pair<std::string, std::string>>& formFields,
	const std::string& fileFieldName, const std::string& fileName,
	const uint8_t* fileData, size_t fileSize,
	const std::string& contentType,
	const std::vector<std::string>& extraHeaders,
	std::string& responseBody) {

	std::lock_guard<std::mutex> lock(curlMutex_);

	if (!curl_) {
		curl_ = curl_easy_init();
		if (!curl_) return false;
	}

	curl_easy_reset(curl_);
	responseBody.clear();

	curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
	curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteCallback);
	curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &responseBody);
	curl_easy_setopt(curl_, CURLOPT_USERAGENT, "Factory Agent/1.0");
	curl_easy_setopt(curl_, CURLOPT_CONNECTTIMEOUT, 5L);
	curl_easy_setopt(curl_, CURLOPT_TIMEOUT, 120L);  
	curl_easy_setopt(curl_, CURLOPT_TCP_KEEPALIVE, 1L);

	
	curl_mime* mime = curl_mime_init(curl_);
	if (!mime) {
		Logger::Error("RestClient::PerformMultipartUpload: curl_mime_init failed");
		return false;
	}

	
	for (const auto& [name, value] : formFields) {
		curl_mimepart* part = curl_mime_addpart(mime);
		curl_mime_name(part, name.c_str());
		curl_mime_data(part, value.c_str(), CURL_ZERO_TERMINATED);
	}

	
	curl_mimepart* filePart = curl_mime_addpart(mime);
	curl_mime_name(filePart, fileFieldName.c_str());
	curl_mime_filename(filePart, fileName.c_str());
	curl_mime_data(filePart, reinterpret_cast<const char*>(fileData), fileSize);
	curl_mime_type(filePart, contentType.c_str());

	curl_easy_setopt(curl_, CURLOPT_MIMEPOST, mime);

	
	struct curl_slist* headerList = nullptr;
	for (const auto& h : extraHeaders) {
		struct curl_slist* tmp = curl_slist_append(headerList, h.c_str());
		if (!tmp) {
			Logger::Error("RestClient::PerformMultipartUpload: curl_slist_append failed");
			if (headerList) curl_slist_free_all(headerList);
			curl_mime_free(mime);
			return false;
		}
		headerList = tmp;
	}
	if (headerList) {
		curl_easy_setopt(curl_, CURLOPT_HTTPHEADER, headerList);
	}

	CURLcode res = curl_easy_perform(curl_);

	curl_mime_free(mime);
	if (headerList) curl_slist_free_all(headerList);

	if (res != CURLE_OK) {
		Logger::Error("RestClient::Upload curl error: " + std::string(curl_easy_strerror(res))
			+ " URL: " + url);
		return false;
	}

	long httpCode = 0;
	curl_easy_getinfo(curl_, CURLINFO_RESPONSE_CODE, &httpCode);

	if (httpCode >= 200 && httpCode < 300) {
		return true;
	}

	Logger::Error("RestClient::Upload HTTP " + std::to_string(httpCode) + " URL: " + url);
	return false;
}




bool RestClient::Post(const std::wstring& endpoint, const json& data, json& response) {
	std::string url = BuildFullUrl(endpoint);
	std::string requestBody = data.dump();
	std::string responseStr;

	if (PerformJsonRequest("POST", url, requestBody, responseStr)) {
		if (responseStr.empty()) return false;
		try {
			response = json::parse(responseStr);
			return true;
		}
		catch (const std::exception& e) {
			Logger::Error("RestClient::Post JSON parse exception: " + std::string(e.what())
				+ "\nResponse string: " + responseStr);
			return false;
		}
		catch (...) {
			Logger::Error("RestClient::Post unknown exception parsing response.");
			return false;
		}
	}
	return false;
}




bool RestClient::Get(const std::wstring& endpoint, json& response) {
	std::string url = BuildFullUrl(endpoint);
	std::string responseStr;

	if (PerformJsonRequest("GET", url, "", responseStr)) {
		if (responseStr.empty()) return false;
		try {
			response = json::parse(responseStr);
			return true;
		}
		catch (const std::exception& e) {
			Logger::Error("RestClient::Get JSON parse exception: " + std::string(e.what())
				+ "\nResponse string: " + responseStr);
			return false;
		}
		catch (...) {
			Logger::Error("RestClient::Get unknown exception parsing response.");
			return false;
		}
	}
	return false;
}




bool RestClient::UploadFile(const std::wstring& endpoint, const std::string& filePath,
	const std::string& modelName, json& response) {

	
	std::ifstream file(filePath, std::ios::binary | std::ios::ate);
	if (!file.is_open()) {
		Logger::Error("RestClient::UploadFile cannot open file: " + filePath);
		return false;
	}

	std::streamsize fileSize = file.tellg();
	file.seekg(0, std::ios::beg);

	std::vector<uint8_t> fileData(fileSize);
	if (!file.read(reinterpret_cast<char*>(fileData.data()), fileSize)) {
		Logger::Error("RestClient::UploadFile cannot read file: " + filePath);
		return false;
	}
	file.close();

	
	std::filesystem::path p(filePath);
	std::string fileName = p.filename().string();

	std::string url = BuildFullUrl(endpoint);
	std::string responseStr;

	bool ok = PerformMultipartUpload(url,
		{{"modelName", modelName}},
		"file", fileName,
		fileData.data(), fileData.size(),
		"application/octet-stream",
		{},
		responseStr);

	if (ok && !responseStr.empty()) {
		try {
			response = json::parse(responseStr);
			return true;
		}
		catch (...) { return false; }
	}
	return ok;
}




bool RestClient::UploadCompressedData(const std::wstring& endpoint, const std::vector<uint8_t>& compressedData,
	const std::string& fileName, const std::string& modelName, size_t originalSize, json& response) {

	std::string url = BuildFullUrl(endpoint);
	std::string responseStr;

	bool ok = PerformMultipartUpload(url,
		{{"modelName", modelName}},
		"file", fileName,
		compressedData.data(), compressedData.size(),
		"application/gzip",
		{"X-Original-Size: " + std::to_string(originalSize)},
		responseStr);

	if (ok && !responseStr.empty()) {
		try {
			response = json::parse(responseStr);
			return true;
		}
		catch (...) { return false; }
	}
	return ok;
}




bool RestClient::DownloadFile(const std::string& url, const std::string& outputPath) {
	std::lock_guard<std::mutex> lock(curlMutex_);

	if (!curl_) {
		curl_ = curl_easy_init();
		if (!curl_) return false;
	}

	
	std::string fullUrl = url;
	if (url.find("://") == std::string::npos) {
		fullUrl = baseUrl_ + (url[0] == '/' ? "" : "/") + url;
	}

	curl_easy_reset(curl_);

	std::ofstream outFile(outputPath, std::ios::binary | std::ios::trunc);
	if (!outFile.is_open()) {
		Logger::Error("RestClient::DownloadFile cannot create file: " + outputPath);
		return false;
	}

	curl_easy_setopt(curl_, CURLOPT_URL, fullUrl.c_str());
	curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteFileCallback);
	curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &outFile);
	curl_easy_setopt(curl_, CURLOPT_USERAGENT, "Factory Agent/1.0");
	curl_easy_setopt(curl_, CURLOPT_CONNECTTIMEOUT, 5L);
	curl_easy_setopt(curl_, CURLOPT_TIMEOUT, 300L);  
	curl_easy_setopt(curl_, CURLOPT_FOLLOWLOCATION, 1L);
	curl_easy_setopt(curl_, CURLOPT_MAXREDIRS, 5L);

	CURLcode res = curl_easy_perform(curl_);
	outFile.close();

	if (res != CURLE_OK) {
		Logger::Error("RestClient::DownloadFile curl error: " + std::string(curl_easy_strerror(res))
			+ " URL: " + fullUrl);
		std::filesystem::remove(outputPath);
		return false;
	}

	long httpCode = 0;
	curl_easy_getinfo(curl_, CURLINFO_RESPONSE_CODE, &httpCode);

	if (httpCode >= 200 && httpCode < 300) {
		return true;
	}

	Logger::Error("RestClient::DownloadFile HTTP " + std::to_string(httpCode) + " URL: " + fullUrl);
	std::filesystem::remove(outputPath);
	return false;
}




bool RestClient::UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response) {
	if (filePaths.empty()) return false;

	std::lock_guard<std::mutex> lock(curlMutex_);

	if (!curl_) {
		curl_ = curl_easy_init();
		if (!curl_) return false;
	}

	std::string url = BuildFullUrl(endpoint);
	std::string responseStr;

	curl_easy_reset(curl_);

	curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
	curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteCallback);
	curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &responseStr);
	curl_easy_setopt(curl_, CURLOPT_USERAGENT, "Factory Agent/1.0");
	curl_easy_setopt(curl_, CURLOPT_CONNECTTIMEOUT, 5L);
	curl_easy_setopt(curl_, CURLOPT_TIMEOUT, 120L);
	curl_easy_setopt(curl_, CURLOPT_TCP_KEEPALIVE, 1L);

	
	curl_mime* mime = curl_mime_init(curl_);
	if (!mime) {
		Logger::Error("RestClient::UploadFiles: curl_mime_init failed");
		return false;
	}

	for (const auto& filePath : filePaths) {
		std::filesystem::path p(filePath);
		if (!std::filesystem::exists(p)) {
			Logger::Error("RestClient::UploadFiles file not found: " + filePath);
			continue;
		}

		curl_mimepart* part = curl_mime_addpart(mime);
		curl_mime_name(part, "files");
		curl_mime_filedata(part, filePath.c_str());  
		curl_mime_type(part, "application/octet-stream");
	}

	curl_easy_setopt(curl_, CURLOPT_MIMEPOST, mime);

	CURLcode res = curl_easy_perform(curl_);
	curl_mime_free(mime);

	if (res != CURLE_OK) {
		Logger::Error("RestClient::UploadFiles curl error: " + std::string(curl_easy_strerror(res))
			+ " URL: " + url);
		return false;
	}

	long httpCode = 0;
	curl_easy_getinfo(curl_, CURLINFO_RESPONSE_CODE, &httpCode);

	if (httpCode >= 200 && httpCode < 300 && !responseStr.empty()) {
		try {
			response = json::parse(responseStr);
			return true;
		}
		catch (...) { return false; }
	}

	if (httpCode < 200 || httpCode >= 300) {
		Logger::Error("RestClient::UploadFiles HTTP " + std::to_string(httpCode) + " URL: " + url);
	}
	return false;
}