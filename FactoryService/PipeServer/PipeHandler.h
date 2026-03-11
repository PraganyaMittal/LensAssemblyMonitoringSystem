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

    // Returns 0 = client connected, 1 = cancelled (CancelSynchronousIo), -1 = erro
    int  WaitForClient();

    // Blocking read — returns when data arrives, pipe breaks, or CancelSynchronousIo
    std::string ReadMessage();

    // Non-blocking read with timeout (PeekNamedPipe loop)
    std::string ReadMessageWithTimeout(DWORD timeoutMs);

    bool WriteMessage(const std::string& message);

    void DisconnectClient();
    bool IsClientConnected() const;
    void Cleanup();

private:
    HANDLE hPipe_         = INVALID_HANDLE_VALUE;
    bool clientConnected_ = false;
};
