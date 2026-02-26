#pragma once

#include <windows.h>
#include <iostream>
#include <string>
#include "../Common/PipeProtocol.h"

// Handles async (overlapped) pipe I/O operations
class PipeHandler {
private:
    HANDLE hPipe = INVALID_HANDLE_VALUE;
    OVERLAPPED olConnect = {};
    OVERLAPPED olRead = {};
    OVERLAPPED olWrite = {};
    HANDLE hConnectEvent = NULL;
    HANDLE hReadEvent = NULL;
    HANDLE hWriteEvent = NULL;

public:
    bool Initialize() {
        // Create events for overlapped operations
        hConnectEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
        hReadEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
        hWriteEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

        if (!hConnectEvent || !hReadEvent || !hWriteEvent) {
            std::cerr << "[PipeHandler] Failed to create events. Error: " << GetLastError() << std::endl;
            return false;
        }

        olConnect.hEvent = hConnectEvent;
        olRead.hEvent = hReadEvent;
        olWrite.hEvent = hWriteEvent;

        return true;
    }

    // Create the named pipe with overlapped (async) flag
    bool CreatePipe() {
        // Allow any user/privilege level to connect to this pipe
        SECURITY_DESCRIPTOR sd;
        InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION);
        SetSecurityDescriptorDacl(&sd, TRUE, NULL, FALSE); // NULL DACL = open access

        SECURITY_ATTRIBUTES sa;
        sa.nLength = sizeof(sa);
        sa.lpSecurityDescriptor = &sd;
        sa.bInheritHandle = FALSE;

        hPipe = CreateNamedPipeW(
            PipeProtocol::PIPE_NAME,
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,      // async duplex
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            1,                              // max instances
            PipeProtocol::BUFFER_SIZE,      // output buffer
            PipeProtocol::BUFFER_SIZE,      // input buffer
            0,                              // default timeout
            &sa                             // open security — any process can connect
        );

        if (hPipe == INVALID_HANDLE_VALUE) {
            std::cerr << "[PipeHandler] CreateNamedPipe failed. Error: " << GetLastError() << std::endl;
            return false;
        }

        std::cout << "[Server] Pipe created: \\\\.\\pipe\\FactoryPipePOC" << std::endl;
        return true;
    }

    // Wait for client connection (async, can be cancelled via stopEvent)
    // Returns: true if client connected, false if stopEvent was signaled or error
    bool WaitForClient(HANDLE stopEvent) {
        ResetEvent(hConnectEvent);
        BOOL connected = ConnectNamedPipe(hPipe, &olConnect);

        if (connected) {
            // Client already connected before we started waiting
            return true;
        }

        DWORD err = GetLastError();
        if (err == ERROR_IO_PENDING) {
            // Wait for either client connection or stop signal
            HANDLE waitHandles[] = { hConnectEvent, stopEvent };
            DWORD waitResult = WaitForMultipleObjects(2, waitHandles, FALSE, INFINITE);

            if (waitResult == WAIT_OBJECT_0) {
                // Client connected
                return true;
            } else {
                // Stop event signaled or error — cancel the pending connect
                CancelIo(hPipe);
                return false;
            }
        } else if (err == ERROR_PIPE_CONNECTED) {
            // Client was already connected
            return true;
        }

        std::cerr << "[PipeHandler] ConnectNamedPipe failed. Error: " << err << std::endl;
        return false;
    }

    // Async read — waits for data or stopEvent
    // Returns empty string on failure or stop
    std::string ReadMessage(HANDLE stopEvent) {
        char buffer[PipeProtocol::BUFFER_SIZE];
        DWORD bytesRead = 0;

        ResetEvent(hReadEvent);
        BOOL success = ReadFile(hPipe, buffer, sizeof(buffer) - 1, &bytesRead, &olRead);

        if (!success) {
            DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                HANDLE waitHandles[] = { hReadEvent, stopEvent };
                DWORD waitResult = WaitForMultipleObjects(2, waitHandles, FALSE, INFINITE);

                if (waitResult == WAIT_OBJECT_0) {
                    // Read completed
                    if (!GetOverlappedResult(hPipe, &olRead, &bytesRead, FALSE)) {
                        std::cerr << "[PipeHandler] GetOverlappedResult (read) failed. Error: " << GetLastError() << std::endl;
                        return "";
                    }
                } else {
                    CancelIo(hPipe);
                    return "";
                }
            } else if (err == ERROR_BROKEN_PIPE) {
                std::cout << "[Server] Client disconnected (broken pipe)." << std::endl;
                return "";
            } else {
                std::cerr << "[PipeHandler] ReadFile failed. Error: " << err << std::endl;
                return "";
            }
        }

        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    }

    // Async write
    bool WriteMessage(const std::string& message) {
        DWORD bytesWritten = 0;

        ResetEvent(hWriteEvent);
        BOOL success = WriteFile(hPipe, message.c_str(), (DWORD)message.size(), &bytesWritten, &olWrite);

        if (!success) {
            DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                // wait for write to complete (short timeout — writes should be fast)
                DWORD waitResult = WaitForSingleObject(hWriteEvent, 5000);
                if (waitResult == WAIT_OBJECT_0) {
                    GetOverlappedResult(hPipe, &olWrite, &bytesWritten, FALSE);
                } else {
                    std::cerr << "[PipeHandler] Write timed out." << std::endl;
                    CancelIo(hPipe);
                    return false;
                }
            } else {
                std::cerr << "[PipeHandler] WriteFile failed. Error: " << err << std::endl;
                return false;
            }
        }

        return true;
    }

    // Disconnect client from the pipe (so we can reuse it)
    void DisconnectClient() {
        if (hPipe != INVALID_HANDLE_VALUE) {
            FlushFileBuffers(hPipe);
            DisconnectNamedPipe(hPipe);
        }
    }

    HANDLE GetPipeHandle() const { return hPipe; }

    void Cleanup() {
        if (hPipe != INVALID_HANDLE_VALUE) {
            CloseHandle(hPipe);
            hPipe = INVALID_HANDLE_VALUE;
        }
        if (hConnectEvent) { CloseHandle(hConnectEvent); hConnectEvent = NULL; }
        if (hReadEvent) { CloseHandle(hReadEvent); hReadEvent = NULL; }
        if (hWriteEvent) { CloseHandle(hWriteEvent); hWriteEvent = NULL; }
    }

    ~PipeHandler() {
        Cleanup();
    }
};
