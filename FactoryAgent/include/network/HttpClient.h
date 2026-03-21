#ifndef HTTP_CLIENT_H
#define HTTP_CLIENT_H



#include <string>
#include <vector>
#include <cstdint>
#include <mutex>
#include <windows.h>
#include <winhttp.h>
#include "json/json.hpp"

#pragma comment(lib, "winhttp.lib")

using json = nlohmann::json;

class HttpClient {
public:
    HttpClient(const std::wstring& serverUrl);
    ~HttpClient();

    bool Post(const std::wstring& endpoint, const json& data, json& response);
    bool Get(const std::wstring& endpoint, json& response);
    bool UploadFile(const std::wstring& endpoint, const std::string& filePath,
        const std::string& modelName, json& response);
    bool UploadCompressedData(const std::wstring& endpoint, const std::vector<uint8_t>& compressedData,
        const std::string& fileName, const std::string& modelName, size_t originalSize, json& response);
    bool DownloadFile(const std::string& url, const std::string& outputPath);
    bool DownloadFileResumable(const std::string& url, const std::string& outputPath);
    bool UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response);

private:
    std::wstring serverUrl_;
    std::wstring hostName_;
    int port_;
    bool useHttps_;

    // Persistent WinHTTP handles for connection pooling
    HINTERNET hSession_;
    HINTERNET hConnect_;
    std::mutex sessionMutex_;

    bool ParseUrl();

    // Ensure persistent session and connection are open
    bool EnsureConnection();
    void CloseConnection();

    // Core request method using pooled connection
    bool SendRequest(const std::wstring& method, const std::wstring& endpoint,
        const std::string& data, std::string& response);
};

#endif