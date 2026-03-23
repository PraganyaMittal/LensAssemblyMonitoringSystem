#include "network/HttpClient.h"
#include "common/Constants.h"
#include <sstream>
#include <vector>
#include <fstream>
#include <iostream>
#include "network/NetworkUtils.h"
#include "network/UrlParser.h"
#include "core/Logger.h"

HttpClient::HttpClient(const std::wstring& serverUrl) : port_(80), useHttps_(false), hSession_(NULL), hConnect_(NULL) {
    serverUrl_ = serverUrl;
    ParseUrl();
    EnsureConnection();
}

HttpClient::~HttpClient() {
    CloseConnection();
}

bool HttpClient::EnsureConnection() {
    // Already connected
    if (hSession_ && hConnect_) return true;

    // Clean up partial state
    CloseConnection();

    hSession_ = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession_) return false;

    WinHttpSetTimeouts(hSession_, 5000, 5000, 5000, 10000);

    hConnect_ = WinHttpConnect(hSession_, hostName_.c_str(), port_, 0);
    if (!hConnect_) {
        WinHttpCloseHandle(hSession_);
        hSession_ = NULL;
        return false;
    }

    return true;
}

void HttpClient::CloseConnection() {
    if (hConnect_) {
        WinHttpCloseHandle(hConnect_);
        hConnect_ = NULL;
    }
    if (hSession_) {
        WinHttpCloseHandle(hSession_);
        hSession_ = NULL;
    }
}

bool HttpClient::ParseUrl() {
    ParsedUrl parsed = UrlParser::Parse(serverUrl_);
    if (!parsed.isValid) return false;

    if (parsed.scheme.empty()) {
        hostName_ = serverUrl_;
    } else {
        useHttps_ = parsed.isHttps;
        port_ = parsed.port;
        hostName_ = parsed.host;
    }
    return true;
}

bool HttpClient::SendRequest(const std::wstring& method, const std::wstring& endpoint,
    const std::string& data, std::string& response) {
    std::lock_guard<std::mutex> lock(sessionMutex_);

    // Ensure persistent session and connection are alive
    if (!EnsureConnection()) {
        return false;
    }

    DWORD flags = (useHttps_ ? WINHTTP_FLAG_SECURE : 0);
    HINTERNET hRequest = WinHttpOpenRequest(hConnect_, method.c_str(), endpoint.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        // Connection may be stale — reconnect and retry once
        CloseConnection();
        if (!EnsureConnection()) return false;
        hRequest = WinHttpOpenRequest(hConnect_, method.c_str(), endpoint.c_str(),
            NULL, WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!hRequest) return false;
    }

    std::wstring headers = L"Content-Type: application/json\r\n";
    bool result = false;

    BOOL sendOk = WinHttpSendRequest(hRequest, headers.c_str(), -1,
        (LPVOID)data.c_str(), static_cast<DWORD>(data.length()), static_cast<DWORD>(data.length()), 0);

    if (!sendOk) {
        // Connection may have been reset — reconnect and retry once
        WinHttpCloseHandle(hRequest);
        CloseConnection();
        if (!EnsureConnection()) return false;
        hRequest = WinHttpOpenRequest(hConnect_, method.c_str(), endpoint.c_str(),
            NULL, WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!hRequest) return false;
        sendOk = WinHttpSendRequest(hRequest, headers.c_str(), -1,
            (LPVOID)data.c_str(), static_cast<DWORD>(data.length()), static_cast<DWORD>(data.length()), 0);
    }

    if (sendOk) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {
            // Validate HTTP status code — reject non-2xx responses
            DWORD statusCode = 0;
            DWORD statusSize = sizeof(statusCode);
            WinHttpQueryHeaders(hRequest,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX, &statusCode,
                &statusSize, WINHTTP_NO_HEADER_INDEX);

            if (statusCode >= 200 && statusCode < 300) {
                DWORD size = 0;
                std::vector<char> buffer;

                do {
                    size = 0;
                    if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                        buffer.resize(size + 1);
                        DWORD downloaded = 0;
                        if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                            buffer[downloaded] = 0;
                            response.append(buffer.data(), downloaded);
                        }
                    }
                } while (size > 0);

                result = true;
            }
        }
    }

    WinHttpCloseHandle(hRequest);

    return result;
}

bool HttpClient::Post(const std::wstring& endpoint, const json& data, json& response) {
    std::string postData = data.dump();
    std::string responseStr;

    if (SendRequest(L"POST", endpoint, postData, responseStr)) {
        if (responseStr.empty()) {
            return false;
        }
        try {
            response = json::parse(responseStr);
            return true;
        }
        catch (const std::exception& e) {
            Logger::Error("HttpClient::Post JSON parse exception: " + std::string(e.what()) + "\nResponse string: " + responseStr);
            return false;
        }
        catch (...) {
            Logger::Error("HttpClient::Post unknown exception parsing response.");
            return false;
        }
    }

    return false;
}

bool HttpClient::Get(const std::wstring& endpoint, json& response) {
    std::string responseStr;

    if (SendRequest(L"GET", endpoint, "", responseStr)) {
        if (responseStr.empty()) {
            return false;
        }
        try {
            response = json::parse(responseStr);
            return true;
        }
        catch (const std::exception& e) {
            Logger::Error("HttpClient::Get JSON parse exception: " + std::string(e.what()) + "\nResponse string: " + responseStr);
            return false;
        }
        catch (...) {
            Logger::Error("HttpClient::Get unknown exception parsing response.");
            return false;
        }
    }

    return false;
}

bool HttpClient::UploadFile(const std::wstring& endpoint, const std::string& filePath,
    const std::string& modelName, json& response) {

    std::wstring path = endpoint;
    bool useHttps = useHttps_;
    std::wstring host = hostName_;
    int port = port_;

    if (endpoint.find(AgentConstants::PROTOCOL_SEPARATOR) != std::wstring::npos) {
        ParsedUrl parsed = UrlParser::Parse(endpoint);
        if (parsed.isValid) {
            useHttps = parsed.isHttps;
            host = parsed.host;
            port = parsed.port;
            path = parsed.path;
        }
    }

    std::ifstream file(filePath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        return false;
    }

    std::streamsize fileSize = file.tellg();
    file.seekg(0, std::ios::beg);

    std::vector<char> fileData(fileSize);
    if (!file.read(fileData.data(), fileSize)) {
        return false;
    }
    file.close();

    size_t lastSlash = filePath.find_last_of("\\/");
    std::string fileName = (lastSlash != std::string::npos) ? filePath.substr(lastSlash + 1) : filePath;

    std::string boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";

    std::ostringstream bodyStream;
    bodyStream << "--" << boundary << "\r\n";
    bodyStream << "Content-Disposition: form-data; name=\"modelName\"\r\n\r\n";
    bodyStream << modelName << "\r\n";
    bodyStream << "--" << boundary << "\r\n";
    bodyStream << "Content-Disposition: form-data; name=\"file\"; filename=\"" << fileName << "\"\r\n";
    bodyStream << "Content-Type: application/octet-stream\r\n\r\n";

    std::string bodyPrefix = bodyStream.str();
    std::string bodySuffix = "\r\n--" + boundary + "--\r\n";

    DWORD totalSize = static_cast<DWORD>(bodyPrefix.length() + fileData.size() + bodySuffix.length());

    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), port, 0);
    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = (useHttps ? WINHTTP_FLAG_SECURE : 0);

    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    std::wstring contentType = L"Content-Type: multipart/form-data; boundary=" +
        NetworkUtils::ConvertStringToWString(boundary) + L"\r\n";

    bool result = false;

    if (WinHttpSendRequest(hRequest, contentType.c_str(), -1,
        WINHTTP_NO_REQUEST_DATA, 0, totalSize, 0)) {
        DWORD written = 0;

        if (WinHttpWriteData(hRequest, bodyPrefix.c_str(), static_cast<DWORD>(bodyPrefix.length()), &written)) {
            if (WinHttpWriteData(hRequest, fileData.data(), static_cast<DWORD>(fileData.size()), &written)) {
                if (WinHttpWriteData(hRequest, bodySuffix.c_str(), static_cast<DWORD>(bodySuffix.length()), &written)) {
                    if (WinHttpReceiveResponse(hRequest, NULL)) {
                        std::string responseStr;
                        DWORD size = 0;
                        std::vector<char> buffer;

                        do {
                            size = 0;
                            if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                                buffer.resize(size + 1);
                                DWORD downloaded = 0;
                                if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                                    buffer[downloaded] = 0;
                                    responseStr.append(buffer.data(), downloaded);
                                }
                            }
                        } while (size > 0);

                        try {
                            response = json::parse(responseStr);
                            result = true;
                        }
                        catch (...) {
                            result = false;
                        }
                    }
                }
            }
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return result;
}

bool HttpClient::UploadCompressedData(const std::wstring& endpoint, const std::vector<uint8_t>& compressedData,
    const std::string& fileName, const std::string& modelName, size_t originalSize, json& response) {

    std::string boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";

    std::ostringstream bodyStream;
    bodyStream << "--" << boundary << "\r\n";
    bodyStream << "Content-Disposition: form-data; name=\"modelName\"\r\n\r\n";
    bodyStream << modelName << "\r\n";
    bodyStream << "--" << boundary << "\r\n";
    bodyStream << "Content-Disposition: form-data; name=\"file\"; filename=\"" << fileName << "\"\r\n";
    bodyStream << "Content-Type: application/gzip\r\n\r\n";

    std::string bodyPrefix = bodyStream.str();
    std::string bodySuffix = "\r\n--" + boundary + "--\r\n";

    DWORD totalSize = static_cast<DWORD>(bodyPrefix.length() + compressedData.size() + bodySuffix.length());

    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, hostName_.c_str(), port_, 0);
    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = (useHttps_ ? WINHTTP_FLAG_SECURE : 0);
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", endpoint.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    std::wstring headers = L"Content-Type: multipart/form-data; boundary=" +
        NetworkUtils::ConvertStringToWString(boundary) + L"\r\n" +
        L"X-Original-Size: " + std::to_wstring(originalSize) + L"\r\n";

    bool result = false;

    if (WinHttpSendRequest(hRequest, headers.c_str(), -1,
        WINHTTP_NO_REQUEST_DATA, 0, totalSize, 0)) {
        DWORD written = 0;

        if (WinHttpWriteData(hRequest, bodyPrefix.c_str(), static_cast<DWORD>(bodyPrefix.length()), &written)) {
            if (WinHttpWriteData(hRequest, compressedData.data(), static_cast<DWORD>(compressedData.size()), &written)) {
                if (WinHttpWriteData(hRequest, bodySuffix.c_str(), static_cast<DWORD>(bodySuffix.length()), &written)) {
                    if (WinHttpReceiveResponse(hRequest, NULL)) {
                        std::string responseStr;
                        DWORD size = 0;
                        std::vector<char> buffer;

                        do {
                            size = 0;
                            if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                                buffer.resize(size + 1);
                                DWORD downloaded = 0;
                                if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                                    buffer[downloaded] = 0;
                                    responseStr.append(buffer.data(), downloaded);
                                }
                            }
                        } while (size > 0);

                        try {
                            response = json::parse(responseStr);
                            result = true;
                        }
                        catch (...) {
                            result = false;
                        }
                    }
                }
            }
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return result;
}

bool HttpClient::DownloadFile(const std::string& url, const std::string& outputPath) {
    std::wstring wUrl = NetworkUtils::ConvertStringToWString(url);
    if (wUrl.find(AgentConstants::PROTOCOL_SEPARATOR) == std::wstring::npos) {
        wUrl = serverUrl_ + wUrl;
    }

    ParsedUrl parsed = UrlParser::Parse(wUrl);
    if (!parsed.isValid) return false;

    bool useHttps = parsed.isHttps;
    std::wstring host = parsed.host;
    int port = parsed.port;
    std::wstring path = parsed.path;

    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), port, 0);
    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = useHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    bool result = false;

    if (WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
        WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {
            std::ofstream outFile(outputPath, std::ios::binary);
            if (outFile.is_open()) {
                DWORD size = 0;
                std::vector<char> buffer;

                do {
                    size = 0;
                    if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                        buffer.resize(size);
                        DWORD downloaded = 0;
                        if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                            outFile.write(buffer.data(), downloaded);
                        }
                    }
                } while (size > 0);

                outFile.close();
                result = true;
            }
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return result;
}

bool HttpClient::DownloadFileResumable(const std::string& url, const std::string& outputPath) {
    std::wstring wUrl = NetworkUtils::ConvertStringToWString(url);
    if (wUrl.find(AgentConstants::PROTOCOL_SEPARATOR) == std::wstring::npos) {
        wUrl = serverUrl_ + wUrl;
    }

    ParsedUrl parsed = UrlParser::Parse(wUrl);
    if (!parsed.isValid) return false;

    bool useHttps = parsed.isHttps;
    std::wstring host = parsed.host;
    int port = parsed.port;
    std::wstring path = parsed.path;

    
    long long existingBytes = 0;
    {
        std::ifstream checkFile(outputPath, std::ios::binary | std::ios::ate);
        if (checkFile.is_open()) {
            existingBytes = checkFile.tellg();
            checkFile.close();
        }
    }

    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), port, 0);
    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = useHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    
    if (existingBytes > 0) {
        std::wstring rangeHeader = L"Range: bytes=" + std::to_wstring(existingBytes) + L"-\r\n";
        WinHttpAddRequestHeaders(hRequest, rangeHeader.c_str(), (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD);
        std::cout << "[Download] Resuming from byte " << existingBytes << std::endl;
    }

    bool result = false;

    if (WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
        WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {

            
            DWORD statusCode = 0;
            DWORD statusSize = sizeof(statusCode);
            WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);

            
            bool isResume = (statusCode == 206 && existingBytes > 0);
            bool isFullDownload = (statusCode == 200);

            if (isResume || isFullDownload) {
                
                std::ios_base::openmode mode = std::ios::binary;
                if (isResume) {
                    mode |= std::ios::app;  
                }
                else {
                    mode |= std::ios::trunc;  
                }

                std::ofstream outFile(outputPath, mode);
                if (outFile.is_open()) {
                    DWORD size = 0;
                    std::vector<char> buffer;

                    do {
                        size = 0;
                        if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                            buffer.resize(size);
                            DWORD downloaded = 0;
                            if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                                outFile.write(buffer.data(), downloaded);
                            }
                        }
                    } while (size > 0);

                    outFile.close();
                    result = true;

                    if (isResume) {
                        std::cout << "[Download] Resume completed successfully" << std::endl;
                    }
                }
            }
            else {
                std::cerr << "[Download] Unexpected HTTP status: " << statusCode << std::endl;
            }
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return result;
}

bool HttpClient::UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response) {
    if (filePaths.empty()) return false;

    std::wstring host = hostName_;
    int port = port_;
    std::wstring path = endpoint;
    bool useHttps = useHttps_;

    if (endpoint.find(AgentConstants::PROTOCOL_SEPARATOR) != std::wstring::npos) {
        ParsedUrl parsed = UrlParser::Parse(endpoint);
        if (parsed.isValid) {
            useHttps = parsed.isHttps;
            host = parsed.host;
            port = parsed.port;
            path = parsed.path;
        }
    }

    std::string boundary = "----WebKitFormBoundaryMultiFile" + std::to_string(GetTickCount64());
    std::vector<uint8_t> requestBody;

    auto appendStr = [&](const std::string& s) {
        requestBody.insert(requestBody.end(), s.begin(), s.end());
    };

    for (const auto& filePath : filePaths) {
        std::ifstream file(filePath, std::ios::binary | std::ios::ate);
        if (!file.is_open()) continue;

        size_t fileSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);
        std::vector<char> fileData(fileSize);
        if (!file.read(fileData.data(), fileSize)) continue;
        file.close();

        size_t lastSlash = filePath.find_last_of("\\/");
        std::string fileName = (lastSlash != std::string::npos) ? filePath.substr(lastSlash + 1) : filePath;

        appendStr("--" + boundary + "\r\n");
        appendStr("Content-Disposition: form-data; name=\"files\"; filename=\"" + fileName + "\"\r\n");
        appendStr("Content-Type: application/octet-stream\r\n\r\n");
        requestBody.insert(requestBody.end(), fileData.begin(), fileData.end());
        appendStr("\r\n");
    }

    appendStr("--" + boundary + "--\r\n");

    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), port, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return false; }

    DWORD flags = (useHttps ? WINHTTP_FLAG_SECURE : 0);
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(),
        NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return false; }

    std::wstring contentType = L"Content-Type: multipart/form-data; boundary=" +
        NetworkUtils::ConvertStringToWString(boundary) + L"\r\n";

    bool result = false;

    if (WinHttpSendRequest(hRequest, contentType.c_str(), -1, WINHTTP_NO_REQUEST_DATA, 0, (DWORD)requestBody.size(), 0)) {
        DWORD written = 0;
        if (WinHttpWriteData(hRequest, requestBody.data(), (DWORD)requestBody.size(), &written)) {
             if (WinHttpReceiveResponse(hRequest, NULL)) {
                std::string responseStr;
                DWORD size = 0;
                std::vector<char> buffer;
                do {
                    size = 0;
                    if (WinHttpQueryDataAvailable(hRequest, &size) && size > 0) {
                        buffer.resize(size + 1);
                        DWORD downloaded = 0;
                        if (WinHttpReadData(hRequest, buffer.data(), size, &downloaded)) {
                            buffer[downloaded] = 0;
                            responseStr.append(buffer.data(), downloaded);
                        }
                    }
                } while (size > 0);

                try {
                    response = json::parse(responseStr);
                    result = true;
                } catch (...) { result = false; }
            }
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return result;
}