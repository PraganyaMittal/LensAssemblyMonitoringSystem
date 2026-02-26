#pragma once

#include <windows.h>
#include <string>

// ============================================================
// Shared constants between PipeServer and PipeClient
// ============================================================

namespace PipeProtocol {

    // Pipe name — must match on both sides
    constexpr const wchar_t* PIPE_NAME = L"\\\\.\\pipe\\FactoryPipePOC";

    // Buffer size for read/write operations
    constexpr DWORD BUFFER_SIZE = 4096;

    // Timeout for WaitNamedPipe (ms)
    constexpr DWORD CONNECT_TIMEOUT_MS = 5000;

    // Delimiter separating command parts
    constexpr char DELIMITER = '|';

    // ------ Commands (Client -> Server) ------
    constexpr const char* CMD_PING           = "PING";
    constexpr const char* CMD_CHECK_UPDATE   = "CHECK_UPDATE";
    constexpr const char* CMD_GET_CONFIG     = "GET_CONFIG";
    constexpr const char* CMD_READY_TO_UPDATE = "READY_TO_UPDATE";
    constexpr const char* CMD_ACK_SHUTDOWN   = "ACK_SHUTDOWN";

    // ------ Commands (Server -> Client) ------
    constexpr const char* CMD_SHUTDOWN       = "SHUTDOWN";

    // ------ Response prefixes ------
    constexpr const char* RESP_OK            = "RESPONSE|OK";
    constexpr const char* RESP_ERROR         = "RESPONSE|ERROR";

    // ------ Response payloads ------
    constexpr const char* RESP_PONG          = "RESPONSE|OK|PONG";
    constexpr const char* RESP_NO_UPDATE     = "RESPONSE|OK|NO_UPDATE";
    constexpr const char* RESP_BYE           = "RESPONSE|OK|BYE";

    // Service name for Windows SCM
    constexpr const wchar_t* SERVICE_NAME    = L"FactoryPipePOCService";
    constexpr const wchar_t* SERVICE_DISPLAY = L"Factory Pipe POC Service";

    // Agent executable name
    constexpr const wchar_t* AGENT_EXE_NAME  = L"PipeClient.exe";

    // Folder names
    constexpr const wchar_t* UPDATES_FOLDER  = L"updates";
    constexpr const wchar_t* BACKUP_FOLDER   = L"backup";

    // Helper: build a response string
    inline std::string MakeResponse(const char* status, const std::string& payload) {
        return std::string("RESPONSE|") + status + "|" + payload;
    }

    // Helper: parse command name from "COMMAND|payload" format
    inline std::string ParseCommand(const std::string& message) {
        size_t pos = message.find(DELIMITER);
        if (pos == std::string::npos) return message;
        return message.substr(0, pos);
    }

    // Helper: parse payload from "COMMAND|payload" format
    inline std::string ParsePayload(const std::string& message) {
        size_t pos = message.find(DELIMITER);
        if (pos == std::string::npos) return "";
        return message.substr(pos + 1);
    }
}
