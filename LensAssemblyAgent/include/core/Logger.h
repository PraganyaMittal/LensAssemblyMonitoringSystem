#pragma once

#include <string>
#include <atomic>

enum class LogLevel {
	Debug,
	Info,
	Warning,
	Error
};

class Logger {
public:
	static void Initialize(const std::string& configDir);
	static void Shutdown();

	static void Log(LogLevel level, const std::string& message);
	static void Debug(const std::string& message);
	static void Info(const std::string& message);
	static void Warning(const std::string& message);
	static void Error(const std::string& message);

	static int GetErrorCount() { return errorCount_.load(); }

private:
	static std::atomic<int> errorCount_;
};
