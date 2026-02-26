#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include "../Common/PipeProtocol.h"

// Current agent version — change this to simulate different versions
#define AGENT_VERSION "V1.0"

class PipeClient {
private:
    HANDLE hPipe = INVALID_HANDLE_VALUE;

    // Send a message through the pipe
    bool SendMessage(const std::string& message) {
        DWORD bytesWritten = 0;
        BOOL success = WriteFile(hPipe, message.c_str(), (DWORD)message.size(), &bytesWritten, NULL);
        if (!success) {
            std::cerr << "[Client] WriteFile failed. Error: " << GetLastError() << std::endl;
            return false;
        }
        std::cout << "[Client] Sent: " << message << std::endl;
        return true;
    }

    // Read a message from the pipe
    std::string ReadMessage() {
        char buffer[PipeProtocol::BUFFER_SIZE];
        DWORD bytesRead = 0;
        BOOL success = ReadFile(hPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL);
        if (!success) {
            DWORD err = GetLastError();
            if (err == ERROR_MORE_DATA) {
                // message bigger than buffer, read what we got
                buffer[bytesRead] = '\0';
                std::cerr << "[Client] WARNING: Message truncated (ERROR_MORE_DATA)" << std::endl;
                return std::string(buffer, bytesRead);
            }
            std::cerr << "[Client] ReadFile failed. Error: " << err << std::endl;
            return "";
        }
        buffer[bytesRead] = '\0';
        return std::string(buffer, bytesRead);
    }

    // Send a command and wait for response
    std::string SendCommand(const std::string& command, const std::string& payload = "") {
        std::string message = command;
        message += PipeProtocol::DELIMITER;
        message += payload;

        if (!SendMessage(message)) return "";

        std::string response = ReadMessage();
        std::cout << "[Client] Response: " << response << std::endl;
        return response;
    }

public:
    // Connect to the server's named pipe (with retry)
    // Agent runs independently — if the service isn't ready, keep retrying
    bool Connect() {
        std::cout << "[Client] Attempting to connect to service pipe..." << std::endl;

        while (true) {
            // Wait until the pipe is available
            if (!WaitNamedPipeW(PipeProtocol::PIPE_NAME, PipeProtocol::CONNECT_TIMEOUT_MS)) {
                DWORD err = GetLastError();
                if (err == ERROR_FILE_NOT_FOUND) {
                    // Service hasn't created the pipe yet — retry
                    std::cout << "[Client] Service not available yet. Retrying in 3 seconds..." << std::endl;
                    std::this_thread::sleep_for(std::chrono::seconds(3));
                    continue;
                }
                std::cout << "[Client] Pipe busy or timeout. Retrying in 3 seconds..." << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(3));
                continue;
            }

            // Open the pipe
            hPipe = CreateFileW(
                PipeProtocol::PIPE_NAME,
                GENERIC_READ | GENERIC_WRITE,
                0,              // no sharing
                NULL,           // default security
                OPEN_EXISTING,  // pipe must already exist
                0,              // default attributes
                NULL            // no template
            );

            if (hPipe == INVALID_HANDLE_VALUE) {
                DWORD err = GetLastError();
                if (err == ERROR_PIPE_BUSY) {
                    std::cout << "[Client] Pipe is busy. Retrying..." << std::endl;
                    continue;
                }
                std::cerr << "[Client] CreateFile failed. Error: " << err << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(3));
                continue;
            }

            break; // Successfully opened
        }

        // Set pipe to message-read mode
        DWORD mode = PIPE_READMODE_MESSAGE;
        if (!SetNamedPipeHandleState(hPipe, &mode, NULL, NULL)) {
            std::cerr << "[Client] SetNamedPipeHandleState failed. Error: " << GetLastError() << std::endl;
            CloseHandle(hPipe);
            hPipe = INVALID_HANDLE_VALUE;
            return false;
        }

        std::cout << "[Client] Connected to service pipe!" << std::endl;
        return true;
    }

    // Main client loop
    void Run() {
        // 1. Ping the server
        SendCommand(PipeProtocol::CMD_PING);

        // 2. Check for updates
        std::string updateResp = SendCommand(PipeProtocol::CMD_CHECK_UPDATE, AGENT_VERSION);

        // Check if server says an update is available
        if (updateResp.find("UPDATE_AVAILABLE") != std::string::npos) {
            std::cout << "[Client] Update is available! Confirming readiness..." << std::endl;

            // Send READY_TO_UPDATE and read the SHUTDOWN response
            SendMessage(std::string(PipeProtocol::CMD_READY_TO_UPDATE) + "|");
            std::string shutdownMsg = ReadMessage();
            std::cout << "[Client] Received: " << shutdownMsg << std::endl;

            if (PipeProtocol::ParseCommand(shutdownMsg) == PipeProtocol::CMD_SHUTDOWN) {
                std::cout << "[Client] Shutdown command received. Cleaning up..." << std::endl;
                SendMessage(std::string(PipeProtocol::CMD_ACK_SHUTDOWN) + "|");
                Disconnect();
                std::cout << "[Client] Exiting for update." << std::endl;
                return;
            }
        }

        // 3. Get config
        SendCommand(PipeProtocol::CMD_GET_CONFIG);

        // 4. Enter a keep-alive loop — periodically ping and check for updates
        std::cout << "\n[Client] Entering keep-alive loop (Ctrl+C to exit)..." << std::endl;
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(10));

            // Ping
            std::string pingResp = SendCommand(PipeProtocol::CMD_PING);
            if (pingResp.empty()) {
                std::cerr << "[Client] Lost connection to server." << std::endl;
                break;
            }

            // Check for updates periodically
            std::string resp = SendCommand(PipeProtocol::CMD_CHECK_UPDATE, AGENT_VERSION);
            if (resp.find("UPDATE_AVAILABLE") != std::string::npos) {
                std::cout << "[Client] Update detected during keep-alive!" << std::endl;

                // Send READY_TO_UPDATE and read the SHUTDOWN response
                SendMessage(std::string(PipeProtocol::CMD_READY_TO_UPDATE) + "|");
                std::string shutdownMsg = ReadMessage();
                std::cout << "[Client] Received: " << shutdownMsg << std::endl;

                if (PipeProtocol::ParseCommand(shutdownMsg) == PipeProtocol::CMD_SHUTDOWN) {
                    std::cout << "[Client] Shutting down for update..." << std::endl;
                    SendMessage(std::string(PipeProtocol::CMD_ACK_SHUTDOWN) + "|");
                    break;
                }
            }
        }

        Disconnect();
    }

    // Close the pipe handle
    void Disconnect() {
        if (hPipe != INVALID_HANDLE_VALUE) {
            CloseHandle(hPipe);
            hPipe = INVALID_HANDLE_VALUE;
            std::cout << "[Client] Disconnected." << std::endl;
        }
    }

    ~PipeClient() {
        Disconnect();
    }
};


int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Factory Agent (PipeClient) " << AGENT_VERSION << std::endl;
    std::cout << "========================================" << std::endl;

    PipeClient client;

    if (!client.Connect()) {
        std::cerr << "[Client] Failed to connect. Exiting." << std::endl;
        return 1;
    }

    client.Run();

    std::cout << "[Client] Done." << std::endl;
    return 0;
}
