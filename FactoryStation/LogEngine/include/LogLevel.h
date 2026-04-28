#pragma once

/// LogLevel — Severity levels for log entries.
/// Used by all consumers (Agent, Service, AutoUpdater).

namespace LogEngine {

	enum class LogLevel {
		Debug,
		Info,
		Warning,
		Error
	};

	/// Convert LogLevel enum to its string representation for log output.
	inline constexpr const char* LogLevelToString(LogLevel level) {
		switch (level) {
			case LogLevel::Debug:   return "DEBUG";
			case LogLevel::Info:    return "INFO";
			case LogLevel::Warning: return "WARN";
			case LogLevel::Error:   return "ERROR";
			default:                return "UNKNOWN";
		}
	}

} // namespace LogEngine
