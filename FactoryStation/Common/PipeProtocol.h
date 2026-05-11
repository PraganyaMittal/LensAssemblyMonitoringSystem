#pragma once

#include <windows.h>
#include <string>
#include "StringUtils.h"

namespace PipeProtocol {

	// ── Pipe connection constants ──
	constexpr const wchar_t* PIPE_NAME    = L"\\\\.\\pipe\\LensAssemblyUpdatePipe";
	constexpr DWORD BUFFER_SIZE           = 4096;
	constexpr char  DELIMITER             = '|';
	constexpr DWORD CONNECT_TIMEOUT_MS    = 5000;

	// ── IPC Commands (Agent → Service) ──
	constexpr const char* CMD_DEPLOY_REQUEST = "DEPLOY_REQUEST";
	constexpr const char* CMD_DECOMMISSION_REQUEST = "DECOMMISSION_REQUEST";

	// ── IPC Responses (Service → Agent) ──
	constexpr const char* CMD_ACK   = "ACK";
	constexpr const char* CMD_ERROR = "ERROR";

	// ── Message builders ──
	inline std::string MakeMessage(const char* cmd, const std::string& payload = "") {
		return std::string(cmd) + DELIMITER + payload;
	}

	inline std::string MakeResponse(const char* status, const std::string& payload) {
		return std::string("RESPONSE|") + status + "|" + payload;
	}

	// ── Message parsers ──
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
			if (json[i] == '\\' && i + 1 < json.size()) {
				char next = json[i + 1];
				if (next == '\\' || next == '"' || next == '/') {
					result += next;
					i++;
				} else if (next == 'n') {
					result += '\n'; i++;
				} else if (next == 't') {
					result += '\t'; i++;
				} else if (next == 'r') {
					result += '\r'; i++;
				} else {
					result += json[i];
				}
			} else if (json[i] == '"') {
				break;
			} else {
				result += json[i];
			}
		}
		return result;
	}

	// ── String conversion utilities ──
	inline std::string WtoNarrow(const std::wstring& wstr) {
		return StringUtils::WtoA(wstr);
	}

	inline std::wstring NarrowToW(const std::string& str) {
		return StringUtils::AtoW(str);
	}
}
