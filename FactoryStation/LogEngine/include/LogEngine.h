#pragma once

/// LogEngine — Public API for the shared logging library.
///
/// Usage:
///   LogEngine::Initialize(baseDir, configPath, "agent");
///   LogEngine::Info("Heartbeat", "Agent initialized");
///   LogEngine::Error("WebSocket", "Connection failed: " + msg);
///   LogEngine::Shutdown();
///
/// Thread-safe. All functions can be called from any thread.

#include "LogLevel.h"
#include <string>

namespace LogEngine {

	/// Initialize the logging engine.
	/// Must be called once at application startup before any Log calls.
	///
	/// @param baseDir     Absolute base directory (e.g., "C:\\LAMS_Dirs\\")
	/// @param configPath  Full path to log_config.json (e.g., "C:\\LAMS_Dirs\\config\\log_config.json")
	/// @param segment     Config segment name: "agent", "service", or "autoupdater"
	/// @return true if initialized successfully (config loaded or defaults applied)
	bool Initialize(const std::string& baseDir,
	                const std::string& configPath,
	                const std::string& segment);

	/// Shutdown the logging engine.
	/// Flushes pending writes, closes the log file, stops the rotation thread.
	/// Must be called before application exit.
	void Shutdown();

	/// Core log function.
	/// @param level   Severity level (Debug, Info, Warning, Error)
	/// @param module  Module name string (from consumer's enum ToString)
	/// @param message Log message text
	void Log(LogLevel level, const char* module, const std::string& message);

	// ── Convenience wrappers ──

	void Debug(const char* module, const std::string& message);
	void Info(const char* module, const std::string& message);
	void Warning(const char* module, const std::string& message);
	void Error(const char* module, const std::string& message);

	/// Check if the engine has been initialized.
	bool IsInitialized();

} // namespace LogEngine
