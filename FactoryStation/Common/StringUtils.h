#pragma once

// ============================================================================
// StringUtils.h — Single-source string conversion and formatting utilities
// ============================================================================
// Replaces duplicated implementations across:
//   - PipeProtocol.h      (WtoNarrow / NarrowToW)
//   - ServiceConfig.h     (WtoA / AtoW)
//   - UpdateConfig.h      (WtoA / AtoW)
//   - CommandExecutor.cpp  (WideToUtf8, EnsureTrailingSlashA)
//   - ServiceSetup/main.cpp (EnsureTrailingSlash)
//   - Service/main.cpp     (EnsureTrailingSlash, QuoteArg)
// ============================================================================

#include <windows.h>
#include <string>

namespace StringUtils {

	// ── Wide ↔ Narrow (UTF-8) conversion ──

	inline std::string WtoA(const std::wstring& wstr) {
		if (wstr.empty()) return "";
		int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(),
			(int)wstr.size(), nullptr, 0, nullptr, nullptr);
		if (size <= 0) return "";
		std::string result(size, '\0');
		WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(),
			&result[0], size, nullptr, nullptr);
		return result;
	}

	inline std::wstring AtoW(const std::string& str) {
		if (str.empty()) return L"";
		int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(),
			(int)str.size(), nullptr, 0);
		if (size <= 0) return L"";
		std::wstring result(size, L'\0');
		MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(),
			&result[0], size);
		return result;
	}

	// ── Path trailing-slash normalization ──

	inline std::wstring EnsureTrailingSlashW(const std::wstring& path) {
		if (path.empty() || path.back() == L'\\' || path.back() == L'/') return path;
		return path + L"\\";
	}

	inline std::string EnsureTrailingSlashA(const std::string& path) {
		if (path.empty() || path.back() == '\\' || path.back() == '/') return path;
		return path + "\\";
	}

	// ── Command-line argument quoting (safe for CreateProcessW) ──

	inline std::wstring QuoteArgW(const std::wstring& arg) {
		std::wstring quoted = L"\"";
		for (wchar_t ch : arg) {
			if (ch == L'"') quoted += L"\\\"";
			else quoted += ch;
		}
		quoted += L"\"";
		return quoted;
	}

	// ── JSON string escaping ──

	inline std::string JsonEscape(const std::string& s) {
		std::string out;
		out.reserve(s.size() + 8);
		for (char c : s) {
			switch (c) {
				case '"':  out += "\\\""; break;
				case '\\': out += "\\\\"; break;
				case '\n': out += "\\n";  break;
				case '\r': out += "\\r";  break;
				case '\t': out += "\\t";  break;
				case '\b': out += "\\b";  break;
				case '\f': out += "\\f";  break;
				default:   out += c;      break;
			}
		}
		return out;
	}

} // namespace StringUtils
