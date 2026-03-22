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
    // Initialize file-based rotating logger.
    // logDir: directory for log files (e.g., "." for exe directory)
    // maxFileBytes: max size per log file before rotating (default 10 MB)
    // maxFiles: number of rotated files to keep (default 5)
    static void Initialize(const std::string& logDir, size_t maxFileBytes = 10 * 1024 * 1024, int maxFiles = 5);
    static void Shutdown();

    static void Log(LogLevel level, const std::string& message);
    
    
    static void Debug(const std::string& message);
    static void Info(const std::string& message);
    static void Warning(const std::string& message);
    static void Error(const std::string& message);

    // Returns total error count since startup (for heartbeat diagnostics)
    static int GetErrorCount() { return errorCount_.load(); }

    
    
private:
    static std::string LevelToString(LogLevel level);
    static void WriteToFile(const std::string& message);
    static void RotateIfNeeded();
    static std::string GetLogFilePath(int index);

    static std::mutex mutex_;
    static std::ofstream fileStream_;
    static std::string logDir_;
    static size_t maxFileBytes_;
    static int maxFiles_;
    static size_t currentFileSize_;
    static bool initialized_;
    static std::atomic<int> errorCount_;
};


