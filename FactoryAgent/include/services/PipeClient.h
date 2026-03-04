#pragma once

/*
 * PipeClient.h
 * IPC Named Pipe client for managed agent lifecycle & auto-updates.
 * Connects to the PipeServer (Windows Service) to receive SHUTDOWN/UPDATE_NOW
 * commands and maintain a heartbeat via periodic PING messages.
 *
 * Adapted from IPC_NamedPipe_POC/PipeClient for production use.
 * Key differences from POC:
 *   - Uses Logger instead of stdout/stderr
 *   - Bounded connect retries (not infinite loop)
 *   - Integrates with AgentCore's stopRequested_ flag
 *   - Shutdown callback for coordinated agent exit
 */

#include <windows.h>
#include <string>
#include <functional>
#include <atomic>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    // Set callback invoked when server sends SHUTDOWN or UPDATE_NOW.
    // The callback should trigger a graceful agent exit (e.g., PostQuitMessage).
    void SetShutdownCallback(std::function<void()> callback);

    // Connect to the PipeServer with bounded retries.
    // Returns true on success, false if all retries exhausted.
    // Non-fatal: agent can operate without IPC connection.
    bool Connect(int maxRetries = 30, DWORD retryDelayMs = 2000);

    // Main event loop: listens for server commands and sends periodic PINGs.
    // Blocks until stopFlag is set or a SHUTDOWN command is received.
    void RunLoop(std::atomic<bool>& stopFlag);

    // Cleanly disconnect from the pipe.
    void Disconnect();

    // Check if a live pipe connection exists.
    bool IsConnected() const;

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
    std::function<void()> shutdownCallback_;
};
