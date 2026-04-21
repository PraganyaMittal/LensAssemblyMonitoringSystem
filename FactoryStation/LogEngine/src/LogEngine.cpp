#include "LogEngine.h"
#include "LogConfig.h"
#include "LogFileWriter.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <mutex>
#include <atomic>

namespace LogEngine {

	// ── Module-level state ──

	static LogFileWriter    g_writer;
	static LogSegmentConfig g_config;
	static std::atomic<bool> g_initialized{false};
	static std::mutex       g_initMutex;

	// ── Timestamp with milliseconds ──

	static std::string GetTimestamp() {
		auto now = std::chrono::system_clock::now();
		auto time = std::chrono::system_clock::to_time_t(now);

		auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
			now.time_since_epoch()) % 1000;

		struct tm buf;
		localtime_s(&buf, &time);

		std::ostringstream oss;
		oss << (buf.tm_year + 1900) << "-"
		    << std::setfill('0') << std::setw(2) << (buf.tm_mon + 1) << "-"
		    << std::setw(2) << buf.tm_mday << " "
		    << std::setw(2) << buf.tm_hour << ":"
		    << std::setw(2) << buf.tm_min << ":"
		    << std::setw(2) << buf.tm_sec << "."
		    << std::setw(3) << ms.count();
		return oss.str();
	}

	// ── Public API Implementation ──

	bool Initialize(const std::string& baseDir,
	                const std::string& configPath,
	                const std::string& segment) {
		std::lock_guard<std::mutex> lock(g_initMutex);

		if (g_initialized.load()) {
			return true;  // Already initialized
		}

		// Try loading config from JSON
		bool configLoaded = LoadLogConfig(configPath, segment, g_config);

		if (!configLoaded) {
			// Fallback to compile-time defaults
			g_config = GetDefaultConfig(segment);
			std::cerr << "[LogEngine] WARNING: Could not load log_config.json for segment '"
			          << segment << "'. Using default configuration." << std::endl;
		}

		// Initialize the file writer
		bool writerOk = g_writer.Initialize(baseDir, g_config);
		if (!writerOk) {
			std::cerr << "[LogEngine] ERROR: Failed to initialize log file writer." << std::endl;
			return false;
		}

		g_initialized.store(true);

		// Log the initialization itself
		Info("LogEngine", "Logging initialized. Segment: " + segment
		     + ", Rotation: " + std::to_string(g_config.rotationIntervalMinutes) + " min"
		     + ", Retention: " + std::to_string(g_config.retentionDays) + " days"
		     + (configLoaded ? "" : " [DEFAULTS]"));

		return true;
	}

	void Shutdown() {
		std::lock_guard<std::mutex> lock(g_initMutex);

		if (!g_initialized.load()) return;

		Info("LogEngine", "Logging shutdown.");

		g_writer.Close();
		g_initialized.store(false);
	}

	void Log(LogLevel level, const char* module, const std::string& message) {
		if (!g_initialized.load()) return;

		// Build the delimited log line: Datetime<sep>Level<sep>Module<sep>Message
		std::string line;
		line.reserve(256);

		line += GetTimestamp();
		line += g_config.separator;
		line += LogLevelToString(level);
		line += g_config.separator;
		line += module;
		line += g_config.separator;
		line += message;

		// Write to file
		g_writer.WriteLine(line);

		// Also write to stdout/stderr for console visibility during development
		if (level == LogLevel::Error) {
			std::cerr << line << std::endl;
		} else {
			std::cout << line << std::endl;
		}
	}

	// ── Convenience Wrappers ──

	void Debug(const char* module, const std::string& message) {
		Log(LogLevel::Debug, module, message);
	}

	void Info(const char* module, const std::string& message) {
		Log(LogLevel::Info, module, message);
	}

	void Warning(const char* module, const std::string& message) {
		Log(LogLevel::Warning, module, message);
	}

	void Error(const char* module, const std::string& message) {
		Log(LogLevel::Error, module, message);
	}

	bool IsInitialized() {
		return g_initialized.load();
	}

} // namespace LogEngine
