#pragma once

#include <string>
#include <sstream>
#include <mutex>
#include <fstream>
#include <atomic>

enum class LogLevel {
	Debug,
	Info,
	Warning,
	Error
};

class Logger {
public:
	static void Initialize(const std::string& logDir, size_t maxFileBytes = 10 * 1024 * 1024, int maxFiles = 5);
	static void Shutdown();

	static void Log(LogLevel level, const std::string& message);
	static void Debug(const std::string& message);
	static void Info(const std::string& message);
	static void Warning(const std::string& message);
	static void Error(const std::string& message);

	static int GetErrorCount() { return errorCount_.load(); }

private:
	static std::string LevelToString(LogLevel level);
	static void WriteToFile(const std::string& message);
	static void RotateIfNeeded();
	static std::string GetLogFilePath(int index);

	// Primitive state
	static bool initialized_;
	static size_t maxFileBytes_;
	static int maxFiles_;
	static size_t currentFileSize_;

	// String state
	static std::string logDir_;

	// I/O and synchronization
	static std::ofstream fileStream_;
	static std::mutex mutex_;
	static std::atomic<int> errorCount_;
};
