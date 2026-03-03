#pragma once

#include <windows.h>
#include <string>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    bool Connect();
    void Run();
    void Disconnect();

private:
    bool Initialize();
    bool SendMessage(const std::string& message);
    std::string ReadMessage(DWORD timeoutMs = 5000);
    std::string SendCommand(const std::string& command, const std::string& payload = "");
    bool HandleServerCommand(const std::string& command);

    HANDLE hPipe_       = INVALID_HANDLE_VALUE;
    OVERLAPPED olRead_  = {};
    OVERLAPPED olWrite_ = {};
    HANDLE hReadEvent_  = NULL;
    HANDLE hWriteEvent_ = NULL;
    HANDLE hPingTimer_  = NULL;
};
