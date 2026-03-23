#pragma once

#include <windows.h>
#include <string>

namespace PipeProtocol {

	
	constexpr const wchar_t* PIPE_NAME	= L"\\\\.\\pipe\\FactoryUpdatePipe";
	constexpr DWORD BUFFER_SIZE		   = 4096;
	constexpr char  DELIMITER			 = '|';

	constexpr const char* CMD_ACK_SHUTDOWN  = "ACK_SHUTDOWN";
	constexpr const char* CMD_NOTIFY_UPDATE = "NOTIFY_UPDATE";

	constexpr const char* CMD_SHUTDOWN   = "SHUTDOWN";
	constexpr const char* CMD_UPDATE_NOW = "UPDATE_NOW";

	
	constexpr const wchar_t* SERVICE_NAME	= L"FactoryUpdateService";

	constexpr const wchar_t* AGENT_EXE_NAME   = L"FactoryAgent.exe";
	constexpr const wchar_t* SERVICE_EXE_NAME = L"FactoryService.exe";
	constexpr const wchar_t* UPDATER_EXE_NAME = L"AutoUpdater.exe";
	constexpr const wchar_t* LAI_EXE_NAME	 = L"LAI.exe";

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

	inline std::string ExtractJsonValue(const std::string& json, const std::string& key) {
		std::string searchKey = "\"" + key + "\":\"";
		size_t pos = json.find(searchKey);
		if (pos == std::string::npos) return "";
		pos += searchKey.size();

		std::string result;
		for (size_t i = pos; i < json.size(); i++) {
			if (json[i] == '"') {
				break;
			} else {
				result += json[i];
			}
		}
		return result;
	}

	inline std::string WtoNarrow(const std::wstring& wstr) {
		if (wstr.empty()) return "";
		int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), nullptr, 0, nullptr, nullptr);
		std::string result(size, 0);
		WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &result[0], size, nullptr, nullptr);
		return result;
	}
}
