/*
 * for managed lifecycle operations:
 *   - Periodic PING heartbeat to prove agent is alive
 *   - Receives SHUTDOWN / UPDATE_NOW commands from the server
 *   - Graceful shutdown handshake via ACK_SHUTDOWN
 */

#include "../include/services/PipeClient.h"
#include "../include/common/PipeProtocol.h"
#include "../include/Utils/Logger.h"
#include <thread>
#include <chrono>

using Logger = FactoryAgent::Utils::Logger;

// ── Lifecycle ──────────────────────────────────────────────────────────────

PipeClient::~PipeClient() {
    Disconnect();
    if (hReadEvent_)  CloseHandle(hReadEvent_);
    if (hWriteEvent_) CloseHandle(hWriteEvent_);
    if (hPingTimer_)  CloseHandle(hPingTimer_);
}

void PipeClient::SetShutdownCallback(std::function<void()> callback) {
    shutdownCallback_ = std::move(callback);
}

bool PipeClient::IsConnected() const {
    return hPipe_ != INVALID_HANDLE_VALUE;
}

// ── Connection ─────────────────────────────────────────────────────────────

bool PipeClient::Initialize() {
    hReadEvent_  = CreateEvent(NULL, TRUE, FALSE, NULL);
    hWriteEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!hReadEvent_ || !hWriteEvent_) {
        Logger::Error("[IPC] Failed to create overlapped events. Error: " + std::to_string(GetLastError()));
        return false;
    }

    olRead_.hEvent  = hReadEvent_;
    olWrite_.hEvent = hWriteEvent_;

    hPingTimer_ = CreateWaitableTimer(NULL, FALSE, NULL);
    if (!hPingTimer_) {
        Logger::Error("[IPC] Failed to create ping timer. Error: " + std::to_string(GetLastError()));
        return false;
    }

    // Set the waitable timer: first fire after CLIENT_PING_INTERVAL_S, then periodic
    LARGE_INTEGER dueTime;
    dueTime.QuadPart = -(LONGLONG)(PipeProtocol::CLIENT_PING_INTERVAL_S * 10000000LL);
    if (!SetWaitableTimer(hPingTimer_, &dueTime, PipeProtocol::CLIENT_PING_INTERVAL_S * 1000, NULL, NULL, FALSE)) {
        Logger::Error("[IPC] Failed to set ping timer. Error: " + std::to_string(GetLastError()));
        return false;
    }

    return true;
}

bool PipeClient::Connect(int maxRetries, DWORD retryDelayMs) {
    Logger::Info("[IPC] Connecting to update service...");

    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait for the pipe to become available
        if (!WaitNamedPipeW(PipeProtocol::PIPE_NAME, PipeProtocol::CONNECT_TIMEOUT_MS)) {
            if (attempt % 5 == 1) {
                Logger::Info("[IPC] Update service not available. Attempt " + std::to_string(attempt)
                    + "/" + std::to_string(maxRetries) + ". Retrying...");
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(retryDelayMs));
            continue;
        }

        // Try to open the pipe
        hPipe_ = CreateFileW(
            PipeProtocol::PIPE_NAME,
            GENERIC_READ | GENERIC_WRITE,
            0, NULL, OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED, NULL
        );

        if (hPipe_ == INVALID_HANDLE_VALUE) {
            DWORD err = GetLastError();
            Logger::Warning("[IPC] CreateFile failed. Error: " + std::to_string(err)
                + ". Attempt " + std::to_string(attempt) + "/" + std::to_string(maxRetries));
            std::this_thread::sleep_for(std::chrono::milliseconds(retryDelayMs));
            continue;
        }

        // Set message mode on the pipe
        DWORD mode = PIPE_READMODE_MESSAGE;
        if (!SetNamedPipeHandleState(hPipe_, &mode, NULL, NULL)) {
            Logger::Error("[IPC] Failed to set pipe mode. Error: " + std::to_string(GetLastError()));
            CloseHandle(hPipe_);
            hPipe_ = INVALID_HANDLE_VALUE;
            return false;
        }

        // Initialize overlapped I/O and ping timer
        if (!Initialize()) {
            Disconnect();
            return false;
        }

        Logger::Info("[IPC] Connected to update service successfully.");
        return true;
    }

    // All retries exhausted — this is non-fatal
    Logger::Warning("[IPC] Could not connect to update service after "
        + std::to_string(maxRetries) + " attempts. Agent will run without managed updates.");
    return false;
}

// ── I/O Operations ─────────────────────────────────────────────────────────

bool PipeClient::SendMessage(const std::string& message) {
    DWORD bytesWritten = 0;
    ResetEvent(hWriteEvent_);

    BOOL ok = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, &olWrite_);
    if (!ok) {
        DWORD err = GetLastError();
        if (err == ERROR_IO_PENDING) {
            // Wait up to 5 seconds for the write to complete
            if (WaitForSingleObject(hWriteEvent_, 5000) != WAIT_OBJECT_0) {
                CancelIo(hPipe_);
                Logger::Error("[IPC] Write timed out.");
                return false;
            }
            GetOverlappedResult(hPipe_, &olWrite_, &bytesWritten, FALSE);
        } else {
            Logger::Error("[IPC] Write failed. Error: " + std::to_string(err));
            return false;
        }
    }

    return true;
}

std::string PipeClient::ReadMessage(DWORD timeoutMs) {
    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;
    ResetEvent(hReadEvent_);

    BOOL ok = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, &olRead_);
    if (!ok) {
        DWORD err = GetLastError();
        if (err == ERROR_IO_PENDING) {
            if (WaitForSingleObject(hReadEvent_, timeoutMs) != WAIT_OBJECT_0) {
                CancelIo(hPipe_);
                return "";
            }
            if (!GetOverlappedResult(hPipe_, &olRead_, &bytesRead, FALSE)) {
                Logger::Error("[IPC] Read overlapped result failed. Error: " + std::to_string(GetLastError()));
                return "";
            }
        } else if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
            Logger::Info("[IPC] Server disconnected (broken pipe).");
            return "";
        } else {
            Logger::Error("[IPC] Read failed. Error: " + std::to_string(err));
            return "";
        }
    }

    buffer[bytesRead] = '\0';
    return std::string(buffer, bytesRead);
}

std::string PipeClient::SendCommand(const std::string& command, const std::string& payload) {
    if (!SendMessage(PipeProtocol::MakeMessage(command.c_str(), payload))) return "";
    std::string response = ReadMessage();
    return response;
}

// ── Command Handling ───────────────────────────────────────────────────────

bool PipeClient::HandleServerCommand(const std::string& command) {
    if (command == PipeProtocol::CMD_UPDATE_NOW) {
        Logger::Info("[IPC] Server requested UPDATE_NOW. Initiating graceful shutdown for update.");
        SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK_SHUTDOWN));
        if (shutdownCallback_) shutdownCallback_();
        return true;  // Signal to exit the run loop
    }

    if (command == PipeProtocol::CMD_SHUTDOWN) {
        Logger::Info("[IPC] Server requested SHUTDOWN.");
        SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK_SHUTDOWN));
        if (shutdownCallback_) shutdownCallback_();
        return true;  // Signal to exit the run loop
    }

    return false;
}

// ── Main Event Loop ────────────────────────────────────────────────────────

void PipeClient::RunLoop(std::atomic<bool>& stopFlag) {
    // Initial ping to verify connection
    if (SendCommand(PipeProtocol::CMD_PING).empty()) {
        Logger::Error("[IPC] Initial PING failed. Disconnecting.");
        Disconnect();
        return;
    }
    Logger::Info("[IPC] Initial PING successful. Entering event loop.");

    char readBuffer[PipeProtocol::BUFFER_SIZE];

    while (!stopFlag.load()) {
        DWORD bytesRead = 0;
        ResetEvent(hReadEvent_);
        BOOL readOk = ReadFile(hPipe_, readBuffer, sizeof(readBuffer) - 1, &bytesRead, &olRead_);

        // Synchronous read completed immediately
        if (readOk) {
            readBuffer[bytesRead] = '\0';
            std::string msg(readBuffer, bytesRead);
            Logger::Info("[IPC] Received: " + msg);

            if (HandleServerCommand(PipeProtocol::ParseCommand(msg))) {
                Disconnect();
                return;
            }
            continue;
        }

        DWORD err = GetLastError();
        if (err == ERROR_BROKEN_PIPE) {
            Logger::Info("[IPC] Server disconnected (broken pipe in event loop).");
            break;
        }

        if (err != ERROR_IO_PENDING) {
            Logger::Error("[IPC] ReadFile failed in event loop. Error: " + std::to_string(err));
            break;
        }

        // Asynchronous wait: either a server message arrives or ping timer fires
        HANDLE handles[] = { hReadEvent_, hPingTimer_ };
        DWORD result = WaitForMultipleObjects(2, handles, FALSE, INFINITE);

        if (stopFlag.load()) break;  // Check stop flag after wake-up

        if (result == WAIT_OBJECT_0) {
            // Server message arrived
            if (!GetOverlappedResult(hPipe_, &olRead_, &bytesRead, FALSE)) {
                DWORD readErr = GetLastError();
                if (readErr == ERROR_BROKEN_PIPE) {
                    Logger::Info("[IPC] Server disconnected during overlapped read.");
                }
                break;
            }

            readBuffer[bytesRead] = '\0';
            std::string msg(readBuffer, bytesRead);
            Logger::Info("[IPC] Received: " + msg);

            if (HandleServerCommand(PipeProtocol::ParseCommand(msg))) {
                Disconnect();
                return;
            }
        }
        else if (result == WAIT_OBJECT_0 + 1) {
            // Ping timer fired — cancel pending read, send ping to keep connection alive
            CancelIo(hPipe_);
            GetOverlappedResult(hPipe_, &olRead_, &bytesRead, TRUE);

            if (SendCommand(PipeProtocol::CMD_PING).empty()) {
                Logger::Warning("[IPC] PING failed. Server may have disconnected.");
                break;
            }
        }
        else {
            Logger::Error("[IPC] WaitForMultipleObjects returned unexpected: " + std::to_string(result));
            break;
        }
    }

    Disconnect();
}

// ── Update Notification ────────────────────────────────────────────

bool PipeClient::NotifyUpdate(const std::string& payload) {
    if (hPipe_ == INVALID_HANDLE_VALUE) {
        Logger::Warning("[IPC] Cannot notify update — not connected to service.");
        return false;
    }

    Logger::Info("[IPC] Sending NOTIFY_UPDATE to service...");
    std::string response = SendCommand(PipeProtocol::CMD_NOTIFY_UPDATE, payload);

    if (response.empty()) {
        Logger::Error("[IPC] No response from service for NOTIFY_UPDATE.");
        return false;
    }

    Logger::Info("[IPC] Service response: " + response);
    return true;
}

// ── Disconnect ─────────────────────────────────────────────────────────────

void PipeClient::Disconnect() {
    if (hPipe_ != INVALID_HANDLE_VALUE) {
        CancelIo(hPipe_);
        FlushFileBuffers(hPipe_);
        CloseHandle(hPipe_);
        hPipe_ = INVALID_HANDLE_VALUE;
        Logger::Info("[IPC] Disconnected from update service.");
    }
}
