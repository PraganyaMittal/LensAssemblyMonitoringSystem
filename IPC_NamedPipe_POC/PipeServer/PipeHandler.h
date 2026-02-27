#pragma once

#include <windows.h>
#include <string>

class PipeHandler {
public:
    PipeHandler() = default;
    ~PipeHandler();

    PipeHandler(const PipeHandler&) = delete;
    PipeHandler& operator=(const PipeHandler&) = delete;

    bool Initialize();
    bool CreatePipe();
    int  WaitForClient(HANDLE stopEvent, HANDLE extraEvent = NULL);

    std::string ReadMessage(HANDLE stopEvent, HANDLE extraEvent = NULL, bool* outInterrupted = nullptr);
    bool WriteMessage(const std::string& message);

    void DisconnectClient();
    bool IsClientConnected() const;
    void Cleanup();

private:
    HANDLE hPipe_         = INVALID_HANDLE_VALUE;
    OVERLAPPED olConnect_ = {};
    OVERLAPPED olRead_    = {};
    OVERLAPPED olWrite_   = {};
    HANDLE hConnectEvent_ = NULL;
    HANDLE hReadEvent_    = NULL;
    HANDLE hWriteEvent_   = NULL;
    bool clientConnected_ = false;
};
