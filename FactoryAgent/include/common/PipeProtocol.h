#pragma once

#include <windows.h>
#include <string>

namespace PipeProtocol {


	constexpr const wchar_t* PIPE_NAME = L"\\\\.\\pipe\\FactoryUpdatePipe";
	constexpr DWORD BUFFER_SIZE = 4096;
	constexpr DWORD CONNECT_TIMEOUT_MS = 5000;
	constexpr char  DELIMITER = '|';


	constexpr const char* CMD_ACK_SHUTDOWN = "ACK_SHUTDOWN";
	constexpr const char* CMD_NOTIFY_UPDATE = "NOTIFY_UPDATE";


	constexpr const char* CMD_SHUTDOWN = "SHUTDOWN";
	constexpr const char* CMD_UPDATE_NOW = "UPDATE_NOW";


	constexpr const wchar_t* SERVICE_NAME = L"FactoryUpdateService";
	constexpr const wchar_t* SERVICE_DISPLAY = L"Factory Update Service";


	constexpr const wchar_t* AGENT_EXE_NAME = L"FactoryAgent.exe";
	constexpr const wchar_t* SERVICE_EXE_NAME = L"FactoryService.exe";
	constexpr const wchar_t* UPDATER_EXE_NAME = L"AutoUpdater.exe";
	constexpr const wchar_t* LAI_EXE_NAME = L"LAI.exe";


	constexpr const wchar_t* BASE_DIR = L"C:\\Factory_Dirs\\";
	constexpr const wchar_t* CORE_DIR = L"C:\\Factory_Dirs\\Core\\";
	constexpr const wchar_t* LAI_DIR = L"C:\\Factory_Dirs\\LAI\\";
	constexpr const wchar_t* UPDATE_DIR = L"C:\\Factory_Dirs\\update\\";
	constexpr const wchar_t* BACKUP_DIR = L"C:\\Factory_Dirs\\backup\\";


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
