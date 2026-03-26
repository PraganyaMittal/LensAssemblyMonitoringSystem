#include "network/WebSocketClient.h"
#include "common/Constants.h"
#include "json/json.hpp"
#include "core/Logger.h"
#include "network/UrlParser.h"
#include <sstream>

using json = nlohmann::json;

WebSocketClient::WebSocketClient(const std::wstring& baseUrl)
    : baseUrl_(baseUrl), hSession_(NULL), hConnect_(NULL), hRequest_(NULL), hWebSocket_(NULL), running_(false) {
    ParsedUrl parsed = UrlParser::Parse(baseUrl);
    if (parsed.isValid) {
        useHttps_ = parsed.isHttps;
        port_ = parsed.port;
        hostName_ = parsed.host;
    } else {
        useHttps_ = false;
        port_ = 80;
        hostName_ = baseUrl;
    }
}

WebSocketClient::~WebSocketClient() {
    Stop();
}

void WebSocketClient::Stop() {
    running_ = false;

    if (hWebSocket_) {
        WinHttpWebSocketClose(hWebSocket_, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, NULL, 0);
        WinHttpCloseHandle(hWebSocket_);
        hWebSocket_ = NULL;
    }

    if (listenThread_.joinable()) {
        listenThread_.join();
    }

    if (hRequest_) { WinHttpCloseHandle(hRequest_); hRequest_ = NULL; }
    if (hConnect_) { WinHttpCloseHandle(hConnect_); hConnect_ = NULL; }
    if (hSession_) { WinHttpCloseHandle(hSession_); hSession_ = NULL; }
}

void WebSocketClient::Connect(int mcId, std::function<void(std::string, std::string, std::string)> onCommandReceived) {
    if (running_) return;

    onCommand_ = onCommandReceived;
    running_ = true;

    listenThread_ = std::thread([this, mcId]() {
        ListenLoop(mcId);
    });
}

void WebSocketClient::ListenLoop(int mcId) {
    while (running_) {
        if (InitializeHandles() && PerformHandshake()) {
            SendSignalRHandshake();
            RegisterAgent(mcId);

            char buffer[4096];
            DWORD bytesRead = 0;
            WINHTTP_WEB_SOCKET_BUFFER_TYPE bufType;
            fragmentBuffer_.clear();

            while (running_) {
                if (!hWebSocket_) break;
                DWORD result = WinHttpWebSocketReceive(hWebSocket_, buffer, sizeof(buffer), &bytesRead, &bufType);

                if (result != NO_ERROR || bytesRead == 0) {
                    break;
                }

                if (bufType == WINHTTP_WEB_SOCKET_UTF8_FRAGMENT_BUFFER_TYPE ||
                    bufType == WINHTTP_WEB_SOCKET_BINARY_FRAGMENT_BUFFER_TYPE) {
                    
                    fragmentBuffer_.append(buffer, bytesRead);
                }
                else if (bufType == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE ||
                         bufType == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE) {
                    if (!fragmentBuffer_.empty()) {
                        
                        fragmentBuffer_.append(buffer, bytesRead);
                        ProcessMessage(fragmentBuffer_);
                        fragmentBuffer_.clear();
                    } else {
                        
                        std::string payload(buffer, bytesRead);
                        ProcessMessage(payload);
                    }
                }
            }
        }

        
        
        if (hWebSocket_) { WinHttpCloseHandle(hWebSocket_); hWebSocket_ = NULL; }
        if (hRequest_) { WinHttpCloseHandle(hRequest_); hRequest_ = NULL; }
        if (hConnect_) { WinHttpCloseHandle(hConnect_); hConnect_ = NULL; }
        if (hSession_) { WinHttpCloseHandle(hSession_); hSession_ = NULL; }

        if (running_) Sleep(5000);
    }
}

bool WebSocketClient::InitializeHandles() {
    hSession_ = WinHttpOpen(L"LensAssemblyAgent/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
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

bool WebSocketClient::PerformHandshake() {
    DWORD flags = useHttps_ ? WINHTTP_FLAG_SECURE : 0;

    hRequest_ = WinHttpOpenRequest(hConnect_, L"GET", AgentConstants::ENDPOINT_AGENT_HUB, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest_) return false;

    if (useHttps_) {
        DWORD securityFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA |
            SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
            SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
            SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hRequest_, WINHTTP_OPTION_SECURITY_FLAGS, &securityFlags, sizeof(securityFlags));
    }

#pragma warning(suppress: 6387)
    if (!WinHttpSetOption(hRequest_, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, NULL, 0)) {
        return false;
    }

    if (!WinHttpSendRequest(hRequest_, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        return false;
    }

    if (!WinHttpReceiveResponse(hRequest_, NULL)) {
        return false;
    }

    DWORD statusCode = 0;
    DWORD statusCodeSize = sizeof(statusCode);
    WinHttpQueryHeaders(hRequest_, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusCodeSize, WINHTTP_NO_HEADER_INDEX);

    if (statusCode != 101) {
        return false;
    }

    hWebSocket_ = WinHttpWebSocketCompleteUpgrade(hRequest_, NULL);
    if (!hWebSocket_) {
        return false;
    }

    WinHttpCloseHandle(hRequest_);
    hRequest_ = NULL;

    return true;
}

void WebSocketClient::SendSignalRHandshake() {
    std::string handshake = "{\"protocol\":\"json\",\"version\":1}";
    handshake += AgentConstants::SIGNALR_RECORD_SEPARATOR;
    WinHttpWebSocketSend(hWebSocket_, WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE, (PVOID)handshake.c_str(), (DWORD)handshake.length());
}

void WebSocketClient::RegisterAgent(int mcId) {
    json regMsg;
    regMsg["type"] = 1;
    regMsg["target"] = "RegisterAgent";
    regMsg["arguments"] = json::array({ std::to_string(mcId) });

    std::string msg = regMsg.dump() + AgentConstants::SIGNALR_RECORD_SEPARATOR;
    WinHttpWebSocketSend(hWebSocket_, WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE, (PVOID)msg.c_str(), (DWORD)msg.length());
}

void WebSocketClient::ProcessMessage(const std::string& rawData) {
    std::stringstream ss(rawData);
    std::string segment;

    while (std::getline(ss, segment, *AgentConstants::SIGNALR_RECORD_SEPARATOR)) {
        if (segment.empty()) continue;

        try {
            json j = json::parse(segment);

            if (j.contains("type") && j["type"] == 1 && j.contains("target")) {
                std::string target = j["target"];

                if (target == "ReceiveCommand" && j.contains("arguments")) {
                    auto args = j["arguments"];
                    if (args.size() >= 2) {
                        std::string cmd = args[0];
                        std::string payload = args[1];
                        std::string requestId = (args.size() >= 3) ? args[2].get<std::string>() : "";

                        if (onCommand_) {
                            onCommand_(cmd, payload, requestId);
                        }
                    }
                }
            }
        }
        catch (const std::exception& e) {
            Logger::Error("WebSocket process message exception: " + std::string(e.what()));
        }
        catch (...) {
            Logger::Error("WebSocket process message unknown exception");
        }
    }
}