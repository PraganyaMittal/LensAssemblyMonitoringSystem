#pragma once

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00 
#endif

#include <windows.h>
#include <winhttp.h>
#include <string>
#include <functional>
#include <atomic>
#include <thread>
#include <vector>

#include "../Interfaces/IWebSocketClient.h"

#pragma comment(lib, "winhttp.lib")

namespace FactoryAgent {
namespace Network {

class WebSocketClient : public Interfaces::IWebSocketClient {
public:
    WebSocketClient(const std::wstring& baseUrl);
    ~WebSocketClient();

    // Callback signature: (command, payload, requestId)
    void Connect(int mcId, std::function<void(std::string, std::string, std::string)> onCommandReceived);
    void Stop();

private:
    void ListenLoop(int mcId);
    bool InitializeHandles();
    bool PerformHandshake();
    void SendSignalRHandshake();
    void RegisterAgent(int mcId);
    void ProcessMessage(const std::string& message);

    std::wstring baseUrl_;
    std::wstring hostName_;
    int port_;
    bool useHttps_;

    HINTERNET hSession_;
    HINTERNET hConnect_;
    HINTERNET hRequest_;
    HINTERNET hWebSocket_;

    std::atomic<bool> running_;
    std::function<void(std::string, std::string, std::string)> onCommand_;
};

} // namespace Network
} // namespace FactoryAgent