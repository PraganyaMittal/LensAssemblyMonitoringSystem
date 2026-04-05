#pragma once

//  PipeClient — Pure one-shot IPC client
//  No persistent connection, no event loop, no listening.
//  Connect → Send → Read ACK → Disconnect (all on the calling thread).

#include <windows.h>
#include <string>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    // ── Public API ──

    // One-shot: Connect → Send DEPLOY_REQUEST → Read ACK → Disconnect.
    // Returns true if service acknowledged the request.
    // Blocks the calling thread for at most ~5 seconds.
    bool SendDeployRequest(const std::string& payload);

    // Check if the update service is running via SCM.
    // Static utility — no pipe connection needed.
    static bool IsServiceRunning(const std::wstring& serviceName);

    bool IsConnected() const;

private:
    bool Connect(int maxRetries = 3, DWORD retryDelayMs = 1000);
    bool SendMessage(const std::string& message);
    std::string ReadMessage(DWORD timeoutMs = 5000);
    void Disconnect();

    HANDLE hPipe_ = INVALID_HANDLE_VALUE;
};
