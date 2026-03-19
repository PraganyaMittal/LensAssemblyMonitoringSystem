

#include "services/PipeClient.h"
#include "common/PipeProtocol.h"
#include "Utils/Logger.h"
#include <thread>
#include <chrono>

using Logger = Logger;


PipeClient::~PipeClient() {
    Disconnect();
}

void PipeClient::SetShutdownCallback(std::function<void()> callback) {
    shutdownCallback_ = std::move(callback);
}

bool PipeClient::IsConnected() const {
    return hPipe_ != INVALID_HANDLE_VALUE;
}

// ── Connection ─────────────────────────────────────────────────────────────

bool PipeClient::Connect(int maxRetries, DWORD retryDelayMs, std::atomic<bool>* stopFlag) {
    Logger::Info("[IPC] Connecting to update service...");

    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        if (stopFlag && stopFlag->load()) return false;

        if (!WaitNamedPipeW(PipeProtocol::PIPE_NAME, PipeProtocol::CONNECT_TIMEOUT_MS)) {
            if (attempt % 5 == 1) {
                Logger::Info("[IPC] Update service not available. Attempt " + std::to_string(attempt)
                    + "/" + std::to_string(maxRetries) + ". Retrying...");
            }
            
            // Interruptible sleep checking stopFlag
            DWORD elapsed = 0;
            while (elapsed < retryDelayMs) {
                if (stopFlag && stopFlag->load()) return false;
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                elapsed += 100;
            }
            continue;
        }

        hPipe_ = CreateFileW(
            PipeProtocol::PIPE_NAME,
            GENERIC_READ | GENERIC_WRITE,
            0, NULL, OPEN_EXISTING,
            0, NULL
        );

        if (hPipe_ == INVALID_HANDLE_VALUE) {
            DWORD err = GetLastError();
            Logger::Warning("[IPC] CreateFile failed. Error: " + std::to_string(err)
                + ". Attempt " + std::to_string(attempt) + "/" + std::to_string(maxRetries));
            
            // Interruptible sleep checking stopFlag
            DWORD elapsed = 0;
            while (elapsed < retryDelayMs) {
                if (stopFlag && stopFlag->load()) return false;
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                elapsed += 100;
            }
            continue;
        }

        DWORD mode = PIPE_READMODE_MESSAGE;
        if (!SetNamedPipeHandleState(hPipe_, &mode, NULL, NULL)) {
            Logger::Error("[IPC] Failed to set pipe mode. Error: " + std::to_string(GetLastError()));
            CloseHandle(hPipe_);
            hPipe_ = INVALID_HANDLE_VALUE;
            return false;
        }

        Logger::Info("[IPC] Connected to update service.");
        return true;
    }

    Logger::Warning("[IPC] Could not connect after "
        + std::to_string(maxRetries) + " attempts.");
    return false;
}

// ── Messaging ──────────────────────────────────────────────────────────────

bool PipeClient::SendMessage(const std::string& message) {
    if (!IsConnected()) return false;

    DWORD bytesWritten = 0;
    BOOL ok = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, NULL);
    if (!ok) {
        DWORD err = GetLastError();
        if (err == ERROR_BROKEN_PIPE || err == ERROR_NO_DATA) {
            Logger::Info("[IPC] Server disconnected (broken pipe).");
            Disconnect();
        } else {
            Logger::Error("[IPC] Write failed. Error: " + std::to_string(err));
        }
        return false;
    }

    FlushFileBuffers(hPipe_);
    return true;
}

std::string PipeClient::ReadMessage(DWORD timeoutMs) {
    if (!IsConnected()) return "";

    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;

    auto start = std::chrono::steady_clock::now();
    while (true) {
        DWORD bytesAvailable = 0;
        BOOL peekOk = PeekNamedPipe(hPipe_, NULL, 0, NULL, &bytesAvailable, NULL);

        if (!peekOk) {
            DWORD err = GetLastError();
            if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
                Logger::Info("[IPC] Server disconnected (broken pipe).");
            } else {
                Logger::Error("[IPC] PeekNamedPipe failed. Error: " + std::to_string(err));
            }
            Disconnect();
            return "";
        }

        if (bytesAvailable > 0) {
            BOOL readOk = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, NULL);
            if (readOk && bytesRead > 0) {
                buffer[bytesRead] = '\0';
                return std::string(buffer, bytesRead);
            }
            Disconnect();
            return "";
        }

        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start).count();
        if (elapsed >= timeoutMs) {
            return "";
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}

// ── Server Command Handling ────────────────────────────────────────────────

bool PipeClient::HandleServerCommand(const std::string& command) {
    if (command == PipeProtocol::CMD_UPDATE_NOW) {
        Logger::Info("[IPC] Server requested UPDATE_NOW.");
        SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK_SHUTDOWN));
        if (shutdownCallback_) shutdownCallback_();
        return true;
    }

    if (command == PipeProtocol::CMD_SHUTDOWN) {
        Logger::Info("[IPC] Server requested SHUTDOWN. Disconnecting pipe (Agent stays alive).");
        SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK_SHUTDOWN));
        return true;
    }

    return false;
}

// ── Event Loop ─────────────────────────────────────────────────────────────

void PipeClient::RunLoop(std::atomic<bool>& stopFlag) {
    Logger::Info("[IPC] Entering event loop.");

    while (!stopFlag.load() && IsConnected()) {
        // Check for pending update notification
        if (pendingUpdate_.load()) {
            std::string payload;
            {
                std::lock_guard<std::mutex> lock(updateMutex_);
                payload = std::move(pendingPayload_);
                pendingUpdate_.store(false);
            }
            Logger::Info("[IPC] Sending NOTIFY_UPDATE to service...");
            if (!SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_NOTIFY_UPDATE, payload))) {
                Logger::Error("[IPC] Failed to send NOTIFY_UPDATE.");
                break;
            }
        }

        // Poll for server messages
        std::string msg = ReadMessage(500);

        if (!msg.empty()) {
            std::string cmd = PipeProtocol::ParseCommand(msg);

            if (HandleServerCommand(cmd)) {
                Disconnect();
                return;
            }

            Logger::Info("[IPC] Received: " + msg);
        } else if (!IsConnected()) {
            Logger::Info("[IPC] Connection lost.");
            break;
        }
    }

    Disconnect();
}

// ── Update Notification (thread-safe enqueue) ──────────────────────────────

bool PipeClient::NotifyUpdate(const std::string& payload) {
    // Always enqueue — even if disconnected. The pending flag persists
    // across reconnection cycles so the next RunLoop picks it up.
    // This prevents lost notifications when the service is down during staging.
    {
        std::lock_guard<std::mutex> lock(updateMutex_);
        pendingPayload_ = payload;
    }
    pendingUpdate_.store(true);

    if (!IsConnected()) {
        Logger::Warning("[IPC] Update notification enqueued (service not connected — will send on reconnect).");
    } else {
        Logger::Info("[IPC] Update notification enqueued.");
    }
    return true;
}

// ── Disconnect ─────────────────────────────────────────────────────────────

void PipeClient::Disconnect() {
    if (hPipe_ != INVALID_HANDLE_VALUE) {
        FlushFileBuffers(hPipe_);
        CloseHandle(hPipe_);
        hPipe_ = INVALID_HANDLE_VALUE;
        Logger::Info("[IPC] Disconnected from update service.");
    }
}
