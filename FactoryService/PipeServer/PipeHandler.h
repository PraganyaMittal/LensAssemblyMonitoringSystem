#pragma once

#include <windows.h>
#include <string>

class PipeHandler {
public:
    PipeHandler() = default;
    ~PipeHandler();

    PipeHandler(const PipeHandler&) = delete;
    PipeHandler& operator=(const PipeHandler&) = delete;

    bool CreatePipe();

    
    int  WaitForClient();

    
    std::string ReadMessage();

    
    std::string ReadMessageWithTimeout(DWORD timeoutMs);

    bool WriteMessage(const std::string& message);

    void DisconnectClient();
    bool IsClientConnected() const;
    void Cleanup();

private:
    HANDLE hPipe_         = INVALID_HANDLE_VALUE;
    bool clientConnected_ = false;
};
