
#include "network/PipeClient.h"
#include "network/PipeProtocol.h"
#include "core/Logger.h"
#include <thread>
#include <chrono>


PipeClient::~PipeClient() {
    Disconnect();
}

bool PipeClient::IsConnected() const {
    return hPipe_ != INVALID_HANDLE_VALUE;
}



bool PipeClient::Connect(int maxRetries, DWORD retryDelayMs) {
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        if (!WaitNamedPipeW(PipeProtocol::PIPE_NAME, PipeProtocol::CONNECT_TIMEOUT_MS)) {
            Logger::Info("[IPC] Service pipe not available. Attempt " + std::to_string(attempt)
                + "/" + std::to_string(maxRetries));
            std::this_thread::sleep_for(std::chrono::milliseconds(retryDelayMs));
            continue;
        }

        hPipe_ = CreateFileW(
            PipeProtocol::PIPE_NAME,
            GENERIC_READ | GENERIC_WRITE,
            0, NULL, OPEN_EXISTING,
            0, NULL  // Synchronous — no OVERLAPPED needed for one-shot
        );

        if (hPipe_ == INVALID_HANDLE_VALUE) {
            DWORD err = GetLastError();
            Logger::Warning("[IPC] CreateFile failed. Error: " + std::to_string(err)
                + ". Attempt " + std::to_string(attempt) + "/" + std::to_string(maxRetries));
            std::this_thread::sleep_for(std::chrono::milliseconds(retryDelayMs));
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

    Logger::Warning("[IPC] Could not connect after " + std::to_string(maxRetries) + " attempts.");
    return false;
}



bool PipeClient::SendMessage(const std::string& message) {
    if (!IsConnected()) return false;

    DWORD bytesWritten = 0;
    BOOL ok = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, NULL);
    if (!ok) {
        DWORD err = GetLastError();
        Logger::Error("[IPC] Write failed. Error: " + std::to_string(err));
        return false;
    }

    FlushFileBuffers(hPipe_);
    return true;
}

std::string PipeClient::ReadMessage(DWORD timeoutMs) {
    if (!IsConnected()) return "";

    // Set a read timeout via a simple timed wait approach.
    // Since we're using synchronous I/O, we use OVERLAPPED + WaitForSingleObject for timeout.
    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;

    OVERLAPPED ov = {};
    ov.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!ov.hEvent) return "";

    BOOL readOk = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, &ov);
    DWORD err = GetLastError();

    if (!readOk && err == ERROR_IO_PENDING) {
        DWORD waitResult = WaitForSingleObject(ov.hEvent, timeoutMs);
        if (waitResult == WAIT_OBJECT_0) {
            if (GetOverlappedResult(hPipe_, &ov, &bytesRead, FALSE) && bytesRead > 0) {
                CloseHandle(ov.hEvent);
                buffer[bytesRead] = '\0';
                return std::string(buffer, bytesRead);
            }
        } else if (waitResult == WAIT_TIMEOUT) {
            CancelIoEx(hPipe_, &ov);
            CloseHandle(ov.hEvent);
            Logger::Warning("[IPC] Read timed out.");
            return "";
        }

        CancelIoEx(hPipe_, &ov);
        CloseHandle(ov.hEvent);
        return "";
    } else if (readOk && bytesRead > 0) {
        CloseHandle(ov.hEvent);
        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    } else {
        CloseHandle(ov.hEvent);
        Logger::Error("[IPC] ReadFile failed. Error: " + std::to_string(err));
        return "";
    }
}



bool PipeClient::SendDeployRequest(const std::string& payload) {
    if (!Connect(3, 1000)) {
        Logger::Error("[IPC] Cannot connect to update service for deploy request.");
        return false;
    }

    std::string msg = PipeProtocol::MakeMessage(PipeProtocol::CMD_DEPLOY_REQUEST, payload);
    if (!SendMessage(msg)) {
        Logger::Error("[IPC] Failed to send DEPLOY_REQUEST.");
        Disconnect();
        return false;
    }

    // 3. Synchronous read for ACK (blocking, up to 5 seconds on same thread)
    std::string response = ReadMessage(5000);
    Disconnect();

    if (response.empty()) {
        Logger::Error("[IPC] No response from service after DEPLOY_REQUEST.");
        return false;
    }

    std::string cmd = PipeProtocol::ParseCommand(response);
    if (cmd == PipeProtocol::CMD_ACK) {
        Logger::Info("[IPC] Service acknowledged deploy request.");
        return true;
    }

    Logger::Error("[IPC] Unexpected response from service: " + response);
    return false;
}



bool PipeClient::IsServiceRunning(const std::wstring& serviceName) {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
    if (!hSCM) return false;

    SC_HANDLE hService = OpenServiceW(hSCM, serviceName.c_str(), SERVICE_QUERY_STATUS);
    if (!hService) {
        CloseServiceHandle(hSCM);
        return false;
    }

    SERVICE_STATUS status = {};
    bool running = (QueryServiceStatus(hService, &status) &&
                    status.dwCurrentState == SERVICE_RUNNING);

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return running;
}



void PipeClient::Disconnect() {
    if (hPipe_ != INVALID_HANDLE_VALUE) {
        FlushFileBuffers(hPipe_);
        CloseHandle(hPipe_);
        hPipe_ = INVALID_HANDLE_VALUE;
        Logger::Info("[IPC] Disconnected from update service.");
    }
}
