#include "PipeHandler.h"
#include "../Common/PipeProtocol.h"
#include <iostream>

PipeHandler::~PipeHandler() {
    Cleanup();
}

bool PipeHandler::Initialize() {
    hConnectEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    hReadEvent_    = CreateEvent(NULL, TRUE, FALSE, NULL);
    hWriteEvent_   = CreateEvent(NULL, TRUE, FALSE, NULL);

    if (!hConnectEvent_ || !hReadEvent_ || !hWriteEvent_) {
        std::cerr << "[PipeHandler] Failed to create events. Error: " << GetLastError() << std::endl;
        return false;
    }

    olConnect_.hEvent = hConnectEvent_;
    olRead_.hEvent    = hReadEvent_;
    olWrite_.hEvent   = hWriteEvent_;
    return true;
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
        PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
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

int PipeHandler::WaitForClient(HANDLE stopEvent, HANDLE extraEvent) {
    // Always reset pipe to listening state — handles both:
    // 1. Previous client was connected (normal disconnect)
    // 2. Previous ConnectNamedPipe was CancelIo'd (pipe needs reset)
    if (clientConnected_) {
        FlushFileBuffers(hPipe_);
        clientConnected_ = false;
    }
    DisconnectNamedPipe(hPipe_);

    ResetEvent(hConnectEvent_);
    BOOL connected = ConnectNamedPipe(hPipe_, &olConnect_);

    if (connected) {
        clientConnected_ = true;
        return 0;
    }

    DWORD err = GetLastError();

    if (err == ERROR_PIPE_CONNECTED) {
        clientConnected_ = true;
        return 0;
    }

    if (err != ERROR_IO_PENDING) {
        std::cerr << "[PipeHandler] ConnectNamedPipe failed. Error: " << err << std::endl;
        return -1;
    }

    HANDLE handles[3];
    DWORD count = 0;
    handles[count++] = hConnectEvent_;
    handles[count++] = stopEvent;
    if (extraEvent) handles[count++] = extraEvent;

    DWORD result = WaitForMultipleObjects(count, handles, FALSE, INFINITE);

    if (result == WAIT_OBJECT_0) {
        clientConnected_ = true;
        return 0;
    }
    if (result == WAIT_OBJECT_0 + 1) {
        CancelIo(hPipe_);
        return 1;
    }
    if (result == WAIT_OBJECT_0 + 2) {
        CancelIo(hPipe_);
        return 2;
    }

    CancelIo(hPipe_);
    return -1;
}

std::string PipeHandler::ReadMessage(HANDLE stopEvent, HANDLE extraEvent, bool* outInterrupted) {
    if (!clientConnected_) return "";
    if (outInterrupted) *outInterrupted = false;

    char buffer[PipeProtocol::BUFFER_SIZE];
    DWORD bytesRead = 0;

    ResetEvent(hReadEvent_);
    BOOL success = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, &olRead_);

    if (success) {
        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    }

    DWORD err = GetLastError();

    if (err == ERROR_BROKEN_PIPE) {
        std::cout << "[PipeHandler] Client disconnected (broken pipe)." << std::endl;
        return "";
    }

    if (err != ERROR_IO_PENDING) {
        std::cerr << "[PipeHandler] ReadFile failed. Error: " << err << std::endl;
        return "";
    }

    HANDLE handles[3];
    DWORD count = 0;
    handles[count++] = hReadEvent_;
    handles[count++] = stopEvent;
    if (extraEvent) handles[count++] = extraEvent;

    DWORD result = WaitForMultipleObjects(count, handles, FALSE, INFINITE);

    if (result == WAIT_OBJECT_0) {
        if (!GetOverlappedResult(hPipe_, &olRead_, &bytesRead, FALSE)) {
            DWORD readErr = GetLastError();
            if (readErr == ERROR_BROKEN_PIPE)
                std::cout << "[PipeHandler] Client disconnected (broken pipe)." << std::endl;
            return "";
        }
        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    }

    if (result == WAIT_OBJECT_0 + 2 && outInterrupted) {
        *outInterrupted = true;
    }

    CancelIo(hPipe_);
    return "";
}

bool PipeHandler::WriteMessage(const std::string& message) {
    if (!clientConnected_) return false;

    DWORD bytesWritten = 0;
    ResetEvent(hWriteEvent_);
    BOOL success = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, &olWrite_);

    if (success) return true;

    DWORD err = GetLastError();

    if (err == ERROR_IO_PENDING) {
        DWORD wait = WaitForSingleObject(hWriteEvent_, 5000);
        if (wait == WAIT_OBJECT_0) {
            GetOverlappedResult(hPipe_, &olWrite_, &bytesWritten, FALSE);
            return true;
        }
        std::cerr << "[PipeHandler] Write timed out." << std::endl;
        CancelIo(hPipe_);
        return false;
    }

    // Don't clear clientConnected_ here — let DisconnectClient() handle it
    // so DisconnectNamedPipe is always called before the flag is reset

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

    if (hPipe_ != INVALID_HANDLE_VALUE) { CloseHandle(hPipe_); hPipe_ = INVALID_HANDLE_VALUE; }
    if (hConnectEvent_) { CloseHandle(hConnectEvent_); hConnectEvent_ = NULL; }
    if (hReadEvent_)    { CloseHandle(hReadEvent_);    hReadEvent_ = NULL; }
    if (hWriteEvent_)   { CloseHandle(hWriteEvent_);   hWriteEvent_ = NULL; }
}
