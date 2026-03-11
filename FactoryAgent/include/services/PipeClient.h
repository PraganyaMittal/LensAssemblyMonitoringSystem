#pragma once

/*
 * PipeClient.h
 * IPC Named Pipe client for managed agent lifecycle & auto-updates.
 * Connects to the PipeServer (Windows Service) to receive SHUTDOWN/UPDATE_NOW
 * commands and maintain a heartbeat via periodic PING messages.
 *
 * Thread model:
 *   - All pipe I/O is owned by the IPC thread (RunLoop).
 *   - Other threads enqueue work via NotifyUpdate (atomic flag + mutex).
 */

#include <windows.h>
#include <string>
#include <functional>
#include <atomic>
#include <mutex>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    // Set callback invoked when server sends SHUTDOWN or UPDATE_NOW.
    void SetShutdownCallback(std::function<void()> callback);

    // Connect to the PipeServer with bounded retries.
    // Returns true on success. Non-fatal: agent can operate without IPC.
    bool Connect(int maxRetries = 30, DWORD retryDelayMs = 2000);

    // Main event loop: listens for server commands and sends periodic PINGs.
    // Blocks until stopFlag is set or a SHUTDOWN command is received.
    void RunLoop(std::atomic<bool>& stopFlag);

    // Cleanly disconnect from the pipe.
    void Disconnect();

    // Enqueue an update notification for the IPC thread to send.
    // Thread-safe: can be called from any thread.
    // Returns true if enqueued, false if not connected.
    bool NotifyUpdate(const std::string& payload);

    bool IsConnected() const;

private:
    bool SendMessage(const std::string& message);
    std::string ReadMessage(DWORD timeoutMs = 5000);
    bool HandleServerCommand(const std::string& command);

    HANDLE hPipe_ = INVALID_HANDLE_VALUE;
    std::function<void()> shutdownCallback_;

    // Cross-thread update notification (update thread → IPC thread)
    std::atomic<bool> pendingUpdate_{false};
    std::string       pendingPayload_;
    std::mutex        updateMutex_;
};
