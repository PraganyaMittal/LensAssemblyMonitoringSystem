#include "PipeClient.h"
#include "../Common/PipeProtocol.h"
#include <iostream>
#include <thread>
#include <chrono>

PipeClient::~PipeClient() {
    Disconnect();
    if (hReadEvent_)  CloseHandle(hReadEvent_);
    if (hWriteEvent_) CloseHandle(hWriteEvent_);
    if (hPingTimer_)  CloseHandle(hPingTimer_);
}

bool PipeClient::Initialize() {
    hReadEvent_  = CreateEvent(NULL, TRUE, FALSE, NULL);
    hWriteEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!hReadEvent_ || !hWriteEvent_) return false;

    olRead_.hEvent  = hReadEvent_;
    olWrite_.hEvent = hWriteEvent_;

    hPingTimer_ = CreateWaitableTimer(NULL, FALSE, NULL);
    if (!hPingTimer_) return false;

    LARGE_INTEGER dueTime;
    dueTime.QuadPart = -(LONGLONG)(PipeProtocol::CLIENT_PING_INTERVAL_S * 10000000LL);
    return SetWaitableTimer(hPingTimer_, &dueTime, PipeProtocol::CLIENT_PING_INTERVAL_S * 1000, NULL, NULL, FALSE) != 0;
}

bool PipeClient::SendMessage(const std::string& message) {
    DWORD bytesWritten = 0;
    ResetEvent(hWriteEvent_);

    BOOL ok = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, &olWrite_);
    if (!ok) {
        DWORD err = GetLastError();
        if (err == ERROR_IO_PENDING) {
            if (WaitForSingleObject(hWriteEvent_, 5000) != WAIT_OBJECT_0) {
                CancelIo(hPipe_);
                std::cerr << "[Agent] Write timed out." << std::endl;
                return false;
            }
            GetOverlappedResult(hPipe_, &olWrite_, &bytesWritten, FALSE);
        } else {
            std::cerr << "[Agent] Write failed. Error: " << err << std::endl;
            return false;
        }
    }

    std::cout << "[Agent] Sent: " << message << std::endl;
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
                std::cerr << "[Agent] Read failed. Error: " << GetLastError() << std::endl;
                return "";
            }
        } else if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
            std::cout << "[Agent] Server disconnected." << std::endl;
            return "";
        } else {
            std::cerr << "[Agent] Read failed. Error: " << err << std::endl;
            return "";
        }
    }

    buffer[bytesRead] = '\0';
    return std::string(buffer, bytesRead);
}

std::string PipeClient::SendCommand(const std::string& command, const std::string& payload) {
    if (!SendMessage(PipeProtocol::MakeMessage(command.c_str(), payload))) return "";
    std::string response = ReadMessage();
    if (!response.empty()) std::cout << "[Agent] Response: " << response << std::endl;
    return response;
}

bool PipeClient::HandleServerCommand(const std::string& command) {
    if (command == PipeProtocol::CMD_UPDATE_NOW || command == PipeProtocol::CMD_SHUTDOWN) {
        std::cout << "[Agent] Server requested shutdown." << std::endl;
        SendMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK_SHUTDOWN));
        return true;
    }

    if (command == PipeProtocol::CMD_HEALTH_CHECK) {
        SendMessage(std::string(PipeProtocol::RESP_HEALTHY));
    }

    return false;
}

bool PipeClient::Connect() {
    std::cout << "[Agent] Connecting to service..." << std::endl;
    int attempt = 0;

    while (true) {
        attempt++;

        if (!WaitNamedPipeW(PipeProtocol::PIPE_NAME, PipeProtocol::CONNECT_TIMEOUT_MS)) {
            if (attempt % 5 == 1)
                std::cout << "[Agent] Service not available. Retrying..." << std::endl;
            std::this_thread::sleep_for(std::chrono::seconds(2));
            continue;
        }

        hPipe_ = CreateFileW(PipeProtocol::PIPE_NAME, GENERIC_READ | GENERIC_WRITE,
                              0, NULL, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, NULL);

        if (hPipe_ == INVALID_HANDLE_VALUE) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
            continue;
        }

        break;
    }

    DWORD mode = PIPE_READMODE_MESSAGE;
    if (!SetNamedPipeHandleState(hPipe_, &mode, NULL, NULL)) {
        CloseHandle(hPipe_);
        hPipe_ = INVALID_HANDLE_VALUE;
        return false;
    }

    if (!Initialize()) {
        Disconnect();
        return false;
    }

    std::cout << "[Agent] Connected!" << std::endl;
    return true;
}

void PipeClient::Run() {
    if (SendCommand(PipeProtocol::CMD_PING).empty()) return;

    std::cout << "[Agent] Running (event-driven)..." << std::endl;

    char readBuffer[PipeProtocol::BUFFER_SIZE];

    while (true) {
        DWORD bytesRead = 0;
        ResetEvent(hReadEvent_);
        BOOL readOk = ReadFile(hPipe_, readBuffer, sizeof(readBuffer) - 1, &bytesRead, &olRead_);

        if (readOk) {
            readBuffer[bytesRead] = '\0';
            std::string msg(readBuffer, bytesRead);
            std::cout << "[Agent] Received: " << msg << std::endl;

            if (HandleServerCommand(PipeProtocol::ParseCommand(msg))) {
                Disconnect();
                return;
            }
            continue;
        }

        DWORD err = GetLastError();
        if (err == ERROR_BROKEN_PIPE) {
            std::cout << "[Agent] Server disconnected." << std::endl;
            break;
        }

        if (err != ERROR_IO_PENDING) {
            std::cerr << "[Agent] ReadFile failed. Error: " << err << std::endl;
            break;
        }

        HANDLE handles[] = { hReadEvent_, hPingTimer_ };
        DWORD result = WaitForMultipleObjects(2, handles, FALSE, INFINITE);

        if (result == WAIT_OBJECT_0) {
            if (!GetOverlappedResult(hPipe_, &olRead_, &bytesRead, FALSE)) {
                DWORD readErr = GetLastError();
                if (readErr == ERROR_BROKEN_PIPE)
                    std::cout << "[Agent] Server disconnected." << std::endl;
                break;
            }

            readBuffer[bytesRead] = '\0';
            std::string msg(readBuffer, bytesRead);
            std::cout << "[Agent] Received: " << msg << std::endl;

            if (HandleServerCommand(PipeProtocol::ParseCommand(msg))) {
                Disconnect();
                return;
            }
        }
        else if (result == WAIT_OBJECT_0 + 1) {
            // Ping timer — cancel pending read, send ping
            CancelIo(hPipe_);
            GetOverlappedResult(hPipe_, &olRead_, &bytesRead, TRUE);

            if (SendCommand(PipeProtocol::CMD_PING).empty()) break;
        }
        else {
            break;
        }
    }

    Disconnect();
}

void PipeClient::Disconnect() {
    if (hPipe_ != INVALID_HANDLE_VALUE) {
        CancelIo(hPipe_);
        FlushFileBuffers(hPipe_);
        CloseHandle(hPipe_);
        hPipe_ = INVALID_HANDLE_VALUE;
    }
}
