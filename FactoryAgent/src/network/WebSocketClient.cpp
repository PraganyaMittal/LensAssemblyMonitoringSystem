#include "../../include/network/WebSocketClient.h"
#include "../../include/common/Constants.h"
#include "../../third_party/json/json.hpp"
#include <sstream>

using json = nlohmann::json;

WebSocketClient::WebSocketClient(const std::wstring& baseUrl)
    : baseUrl_(baseUrl), hSession_(NULL), hConnect_(NULL), hRequest_(NULL), hWebSocket_(NULL), running_(false) {

    std::wstring url = baseUrl;
    size_t protocolEnd = url.find(L"://");

    useHttps_ = false;
    port_ = 80;

    if (protocolEnd != std::wstring::npos) {
        std::wstring protocol = url.substr(0, protocolEnd);
        useHttps_ = (protocol == L"https");
        port_ = useHttps_ ? 443 : 80;
        url = url.substr(protocolEnd + 3);
    }

    size_t portStart = url.find(L":");
    size_t pathStart = url.find(L"/");

    if (portStart != std::wstring::npos) {
        hostName_ = url.substr(0, portStart);
        std::wstring portStr = (pathStart != std::wstring::npos)
            ? url.substr(portStart + 1, pathStart - portStart - 1)
            : url.substr(portStart + 1);
        port_ = _wtoi(portStr.c_str());
    }
    else {
        hostName_ = (pathStart != std::wstring::npos) ? url.substr(0, pathStart) : url;
    }
}

WebSocketClient::~WebSocketClient() {
    Stop();
}

void WebSocketClient::Stop() {
    running_ = false;
    if (hWebSocket_) WinHttpWebSocketClose(hWebSocket_, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, NULL, 0);
    if (hRequest_) WinHttpCloseHandle(hRequest_);
    if (hConnect_) WinHttpCloseHandle(hConnect_);
    if (hSession_) WinHttpCloseHandle(hSession_);

    hWebSocket_ = NULL;
    hRequest_ = NULL;
    hConnect_ = NULL;
    hSession_ = NULL;
}

void WebSocketClient::Connect(int pcId, std::function<void(std::string, std::string, std::string)> onCommandReceived) {
    if (running_) return;

    onCommand_ = onCommandReceived;
    running_ = true;

    std::thread([this, pcId]() {
        ListenLoop(pcId);
    }).detach();
}

void WebSocketClient::ListenLoop(int pcId) {
    while (running_) {
        if (InitializeHandles() && PerformHandshake()) {
            SendSignalRHandshake();
            RegisterAgent(pcId);

            char buffer[4096];
            DWORD bytesRead = 0;
            WINHTTP_WEB_SOCKET_BUFFER_TYPE bufType;

            while (running_) {
                DWORD result = WinHttpWebSocketReceive(hWebSocket_, buffer, sizeof(buffer), &bytesRead, &bufType);

                if (result != NO_ERROR || bytesRead == 0) {
                    break;
                }

                if (bufType == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE ||
                    bufType == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE) {
                    std::string payload(buffer, bytesRead);
                    ProcessMessage(payload);
                }
            }
        }

        // Cleanup handles before retry
        if (hWebSocket_) WinHttpCloseHandle(hWebSocket_);
        if (hRequest_) WinHttpCloseHandle(hRequest_);
        if (hConnect_) WinHttpCloseHandle(hConnect_);
        if (hSession_) WinHttpCloseHandle(hSession_);

        hWebSocket_ = NULL;
        hRequest_ = NULL;
        hConnect_ = NULL;
        hSession_ = NULL;

        if (running_) Sleep(5000);
    }
}

bool WebSocketClient::InitializeHandles() {
    hSession_ = WinHttpOpen(L"FactoryAgent/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession_) return false;

    hConnect_ = WinHttpConnect(hSession_, hostName_.c_str(), port_, 0);
    if (!hConnect_) return false;

    return true;
}

bool WebSocketClient::PerformHandshake() {
    DWORD flags = useHttps_ ? WINHTTP_FLAG_SECURE : 0;

    hRequest_ = WinHttpOpenRequest(hConnect_, L"GET", AgentConstants::ENDPOINT_AGENT_HUB, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest_) return false;

    // Ignore SSL certificate errors for development
    if (useHttps_) {
        DWORD securityFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA |
            SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
            SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
            SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hRequest_, WINHTTP_OPTION_SECURITY_FLAGS, &securityFlags, sizeof(securityFlags));
    }

    if (!WinHttpSetOption(hRequest_, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, NULL, 0)) {
        return false;
    }

    if (!WinHttpSendRequest(hRequest_, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        return false;
    }

    if (!WinHttpReceiveResponse(hRequest_, NULL)) {
        return false;
    }

    // Verify HTTP 101 Switching Protocols
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

void WebSocketClient::RegisterAgent(int pcId) {
    json regMsg;
    regMsg["type"] = 1;
    regMsg["target"] = "RegisterAgent";
    regMsg["arguments"] = json::array({ std::to_string(pcId) });

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

            // SignalR invocation message (type 1) with target method
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
        catch (...) {
            // Ignore parse errors (e.g., keep-alive pings)
        }
    }
}