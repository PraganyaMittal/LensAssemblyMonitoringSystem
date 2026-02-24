#include "../include/network/HttpClient.h"
#include "../include/common/Constants.h"
#include <sstream>
#include <vector>
#include <fstream>
#include "../include/utilities/NetworkUtils.h"

HttpClient::HttpClient(const std::wstring& serverUrl) : port_(80), useHttps_(false) {
    serverUrl_ = serverUrl;
    ParseUrl();
}

HttpClient::~HttpClient() {
}

bool HttpClient::ParseUrl() {
    size_t protocolEnd = serverUrl_.find(AgentConstants::PROTOCOL_SEPARATOR);
    if (protocolEnd != std::wstring::npos) {
        std::wstring protocol = serverUrl_.substr(0, protocolEnd);
        useHttps_ = (protocol == AgentConstants::HTTPS_PROTOCOL);
        port_ = useHttps_ ? AgentConstants::DEFAULT_HTTPS_PORT : AgentConstants::DEFAULT_HTTP_PORT;

        size_t hostStart = protocolEnd + 3;
        size_t portStart = serverUrl_.find(L":", hostStart);
        size_t pathStart = serverUrl_.find(L"/", hostStart);

        if (portStart != std::wstring::npos && (pathStart == std::wstring::npos || portStart < pathStart)) {
            hostName_ = serverUrl_.substr(hostStart, portStart - hostStart);
            size_t portEnd = (pathStart != std::wstring::npos) ? pathStart : serverUrl_.length();
            port_ = _wtoi(serverUrl_.substr(portStart + 1, portEnd - portStart - 1).c_str());
        }
        else if (pathStart != std::wstring::npos) {
            hostName_ = serverUrl_.substr(hostStart, pathStart - hostStart);
        }
        else {
            hostName_ = serverUrl_.substr(hostStart);
        }
    }
    else {
        hostName_ = serverUrl_;
    }

    return true;
}

bool HttpClient::SendRequest(const std::wstring& method, const std::wstring& endpoint,
    const std::string& data, std::string& response) {
    HINTERNET hSession = WinHttpOpen(L"Factory Agent/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) {
        return false;
    }

    HINTERNET hConnect = WinHttpConnect(hSession, hostName_.c_str(), port_, 0);
    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = (useHttps_ ? WINHTTP_FLAG_SECURE : 0);
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, method.c_str(), endpoint.c_str(),
        NULL, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    std::wstring headers = L"Content-Type: application/json\r\n";
    bool result = false;

    if (WinHttpSendRequest(hRequest, headers.c_str(), -1,
        (LPVOID)data.c_str(), static_cast<DWORD>(data.length()), static_cast<DWORD>(data.length()), 0)) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {
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

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return result;
}

bool HttpClient::Post(const std::wstring& endpoint, const json& data, json& response) {
    std::string postData = data.dump();
    std::string responseStr;

    if (SendRequest(L"POST", endpoint, postData, responseStr)) {
        try {
            response = json::parse(responseStr);
            return true;
        }
        catch (...) {
            return false;
        }
    }

    return false;
}

bool HttpClient::Get(const std::wstring& endpoint, json& response) {
    std::string responseStr;

    if (SendRequest(L"GET", endpoint, "", responseStr)) {
        try {
            response = json::parse(responseStr);
            return true;
        }
        catch (...) {
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

    size_t schemeEnd = endpoint.find(AgentConstants::PROTOCOL_SEPARATOR);
    if (schemeEnd != std::wstring::npos) {
        std::wstring scheme = endpoint.substr(0, schemeEnd);
        useHttps = (scheme == AgentConstants::HTTPS_PROTOCOL);

        size_t hostStart = schemeEnd + 3;
        size_t portStart = endpoint.find(L":", hostStart);
        size_t pathStart = endpoint.find(L"/", hostStart);

        if (portStart != std::wstring::npos && (pathStart == std::wstring::npos || portStart < pathStart)) {
            host = endpoint.substr(hostStart, portStart - hostStart);
            size_t portEnd = (pathStart != std::wstring::npos) ? pathStart : endpoint.length();
            port = _wtoi(endpoint.substr(portStart + 1, portEnd - portStart - 1).c_str());
            if (pathStart != std::wstring::npos) {
                path = endpoint.substr(pathStart);
            }
            else {
                path = L"/";
            }
        }
        else if (pathStart != std::wstring::npos) {
            host = endpoint.substr(hostStart, pathStart - hostStart);
            path = endpoint.substr(pathStart);
        }
        else {
            host = endpoint.substr(hostStart);
            path = L"/";
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

    size_t schemeEnd = wUrl.find(AgentConstants::PROTOCOL_SEPARATOR);
    if (schemeEnd == std::wstring::npos) {
        wUrl = serverUrl_ + NetworkUtils::ConvertStringToWString(url);
        schemeEnd = wUrl.find(AgentConstants::PROTOCOL_SEPARATOR);
    }

    std::wstring scheme = wUrl.substr(0, schemeEnd);
    bool useHttps = (scheme == AgentConstants::HTTPS_PROTOCOL);

    size_t hostStart = schemeEnd + 3;
    size_t portStart = wUrl.find(L":", hostStart);
    size_t pathStart = wUrl.find(L"/", hostStart);

    std::wstring host;
    int port = useHttps ? AgentConstants::DEFAULT_HTTPS_PORT : AgentConstants::DEFAULT_HTTP_PORT;
    std::wstring path = L"/";

    if (portStart != std::wstring::npos && (pathStart == std::wstring::npos || portStart < pathStart)) {
        host = wUrl.substr(hostStart, portStart - hostStart);
        size_t portEnd = (pathStart != std::wstring::npos) ? pathStart : wUrl.length();
        port = _wtoi(wUrl.substr(portStart + 1, portEnd - portStart - 1).c_str());
        if (pathStart != std::wstring::npos) {
            path = wUrl.substr(pathStart);
        }
    }
    else if (pathStart != std::wstring::npos) {
        host = wUrl.substr(hostStart, pathStart - hostStart);
        path = wUrl.substr(pathStart);
    }
    else {
        host = wUrl.substr(hostStart);
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

bool HttpClient::UploadFiles(const std::wstring& endpoint, const std::vector<std::string>& filePaths, json& response) {
    if (filePaths.empty()) return false;

    std::wstring host = hostName_;
    int port = port_;
    std::wstring path = endpoint;
    bool useHttps = useHttps_;

    size_t schemeEnd = endpoint.find(AgentConstants::PROTOCOL_SEPARATOR);
    if (schemeEnd != std::wstring::npos) {
        std::wstring scheme = endpoint.substr(0, schemeEnd);
        useHttps = (scheme == AgentConstants::HTTPS_PROTOCOL);
        size_t hostStart = schemeEnd + 3;
        size_t portStart = endpoint.find(L":", hostStart);
        size_t pathStart = endpoint.find(L"/", hostStart);

        if (portStart != std::wstring::npos && (pathStart == std::wstring::npos || portStart < pathStart)) {
            host = endpoint.substr(hostStart, portStart - hostStart);
            size_t portEnd = (pathStart != std::wstring::npos) ? pathStart : endpoint.length();
            port = _wtoi(endpoint.substr(portStart + 1, portEnd - portStart - 1).c_str());
            path = (pathStart != std::wstring::npos) ? endpoint.substr(pathStart) : L"/";
        }
        else if (pathStart != std::wstring::npos) {
            host = endpoint.substr(hostStart, pathStart - hostStart);
            path = endpoint.substr(pathStart);
        }
        else {
            host = endpoint.substr(hostStart);
            path = L"/";
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