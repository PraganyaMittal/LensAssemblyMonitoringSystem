#pragma once

#include <windows.h>
#include <string>

namespace PipeProtocol {

    // Pipe
    constexpr const wchar_t* PIPE_NAME    = L"\\\\.\\pipe\\FactoryPipePOC";
    constexpr DWORD BUFFER_SIZE           = 4096;
    constexpr DWORD CONNECT_TIMEOUT_MS    = 5000;
    constexpr char  DELIMITER             = '|';

    // Timing
    constexpr DWORD AGENT_EXIT_TIMEOUT_MS   = 10000;
    constexpr DWORD RESTART_RETRY_DELAY_MS  = 2000;
    constexpr int   RESTART_MAX_RETRIES     = 3;
    constexpr DWORD HEALTH_CHECK_INTERVAL   = 500;
    constexpr DWORD UPDATE_POLL_INTERVAL_MS = 1000;
    constexpr DWORD CLIENT_PING_INTERVAL_S  = 30;

    // Commands: Agent → Server
    constexpr const char* CMD_PING         = "PING";
    constexpr const char* CMD_ACK_SHUTDOWN = "ACK_SHUTDOWN";

    // Commands: Server → Agent
    constexpr const char* CMD_SHUTDOWN     = "SHUTDOWN";
    constexpr const char* CMD_UPDATE_NOW   = "UPDATE_NOW";


    // Responses
    constexpr const char* RESP_PONG    = "RESPONSE|OK|PONG";


    // Service
    constexpr const wchar_t* SERVICE_NAME    = L"FactoryPipePOCService";
    constexpr const wchar_t* SERVICE_DISPLAY = L"Factory Pipe POC Service";
    constexpr const wchar_t* AGENT_EXE_NAME  = L"FactoryAgent.exe";
    constexpr const wchar_t* UPDATE_FOLDER   = L"update";
    constexpr const wchar_t* BACKUP_FOLDER   = L"backup";

    // Production paths
    constexpr const wchar_t* AGENT_BASE_DIR  = L"C:\\Factory_Dirs\\Agent\\";

    // Update state machine
    enum class UpdateState {
        IDLE, UPDATE_DETECTED, AGENT_STOPPING, AGENT_STOPPED,
        FILES_REPLACING, AGENT_RESTARTING, VERIFYING, FAILED
    };

    inline const char* UpdateStateToString(UpdateState s) {
        switch (s) {
            case UpdateState::IDLE:             return "IDLE";
            case UpdateState::UPDATE_DETECTED:  return "UPDATE_DETECTED";
            case UpdateState::AGENT_STOPPING:   return "AGENT_STOPPING";
            case UpdateState::AGENT_STOPPED:    return "AGENT_STOPPED";
            case UpdateState::FILES_REPLACING:  return "FILES_REPLACING";
            case UpdateState::AGENT_RESTARTING: return "AGENT_RESTARTING";
            case UpdateState::VERIFYING:        return "VERIFYING";
            case UpdateState::FAILED:           return "FAILED";
            default:                            return "UNKNOWN";
        }
    }

    inline std::string MakeMessage(const char* cmd, const std::string& payload = "") {
        return std::string(cmd) + DELIMITER + payload;
    }

    inline std::string MakeResponse(const char* status, const std::string& payload) {
        return std::string("RESPONSE|") + status + "|" + payload;
    }

    inline std::string ParseCommand(const std::string& msg) {
        size_t pos = msg.find(DELIMITER);
        return (pos == std::string::npos) ? msg : msg.substr(0, pos);
    }

    inline std::string ParsePayload(const std::string& msg) {
        size_t pos = msg.find(DELIMITER);
        return (pos == std::string::npos) ? "" : msg.substr(pos + 1);
    }
}
