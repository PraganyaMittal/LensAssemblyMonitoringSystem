#include "PipeHandler.h"
#include "../Common/PipeProtocol.h"
#include <iostream>
#include <chrono>
#include <thread>

PipeHandler::~PipeHandler() {
    Cleanup();
}

bool PipeHandler::CreatePipe() {
    SECURITY_DESCRIPTOR sd;
    InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION);
    SetSecurityDescriptorDacl(&sd, TRUE, NULL, FALSE);

    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(sa);
    sa.lpSecurityDescriptor = &sd;
    sa.bInheritHandle = FALSE;

    hPipe_ = CreateNamedPipeW(
        PipeProtocol::PIPE_NAME,
        PIPE_ACCESS_DUPLEX,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
        1,
        PipeProtocol::BUFFER_SIZE,
        PipeProtocol::BUFFER_SIZE,
        0,
        &sa
    );

    if (hPipe_ == INVALID_HANDLE_VALUE) {
        std::cerr << "[PipeHandler] CreateNamedPipe failed. Error: " << GetLastError() << std::endl;
        return false;
    }

    std::cout << "[PipeHandler] Pipe created." << std::endl;
    return true;
}

int PipeHandler::WaitForClient() {
    if (clientConnected_) {
        FlushFileBuffers(hPipe_);
        clientConnected_ = false;
    }
    DisconnectNamedPipe(hPipe_);

    std::cout << "[PipeHandler] Waiting for agent..." << std::endl;

    BOOL connected = ConnectNamedPipe(hPipe_, NULL);
    DWORD err = GetLastError();

    if (connected || err == ERROR_PIPE_CONNECTED) {
        clientConnected_ = true;
        return 0;
    }

    if (err == ERROR_OPERATION_ABORTED) {
        return 1; 
    }

    std::cerr << "[PipeHandler] ConnectNamedPipe failed. Error: " << err << std::endl;
    return -1;
}

std::string PipeHandler::ReadMessage() {
    if (!clientConnected_) return "";

    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;

    BOOL success = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, NULL);

    if (success && bytesRead > 0) {
        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    }

    DWORD err = GetLastError();

    if (err == ERROR_OPERATION_ABORTED) {
        return "";
    }

    if (err == ERROR_BROKEN_PIPE || err == ERROR_NO_DATA) {
        std::cout << "[PipeHandler] Client disconnected (broken pipe)." << std::endl;
    } else {
        std::cerr << "[PipeHandler] ReadFile failed. Error: " << err << std::endl;
    }

    DisconnectClient();
    return "";
}

std::string PipeHandler::ReadMessageWithTimeout(DWORD timeoutMs) {
    if (!clientConnected_) return "";

    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;

    auto start = std::chrono::steady_clock::now();
    while (true) {
        DWORD bytesAvailable = 0;
        BOOL peekOk = PeekNamedPipe(hPipe_, NULL, 0, NULL, &bytesAvailable, NULL);

        if (!peekOk) {
            DWORD err = GetLastError();
            if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
                std::cout << "[PipeHandler] Client disconnected (broken pipe)." << std::endl;
            } else {
                std::cerr << "[PipeHandler] PeekNamedPipe failed. Error: " << err << std::endl;
            }
            DisconnectClient();
            return "";
        }

        if (bytesAvailable > 0) {
            BOOL readOk = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, NULL);
            if (readOk && bytesRead > 0) {
                buffer[bytesRead] = '\0';
                return std::string(buffer, bytesRead);
            }
            DisconnectClient();
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

bool PipeHandler::WriteMessage(const std::string& message) {
    if (!clientConnected_) return false;

    DWORD bytesWritten = 0;
    BOOL success = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, NULL);

    if (success) {
        FlushFileBuffers(hPipe_);
        return true;
    }

    DWORD err = GetLastError();

    if (err == ERROR_NO_DATA || err == ERROR_BROKEN_PIPE) {
        std::cerr << "[PipeHandler] Client disconnected (broken pipe). Error: " << err << std::endl;
        DisconnectClient();
        return false;
    }

    std::cerr << "[PipeHandler] WriteFile failed. Error: " << err << std::endl;
    return false;
}

void PipeHandler::DisconnectClient() {
    if (hPipe_ == INVALID_HANDLE_VALUE) return;

    if (clientConnected_) {
        FlushFileBuffers(hPipe_);
        DisconnectNamedPipe(hPipe_);
        clientConnected_ = false;
        std::cout << "[PipeHandler] Client disconnected." << std::endl;
    }
}

bool PipeHandler::IsClientConnected() const {
    return clientConnected_;
}

void PipeHandler::Cleanup() {
    if (clientConnected_) DisconnectClient();
    if (hPipe_ != INVALID_HANDLE_VALUE) { 
        CloseHandle(hPipe_); 
        hPipe_ = INVALID_HANDLE_VALUE; 
    }
}
