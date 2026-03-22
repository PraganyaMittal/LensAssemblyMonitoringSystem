#include "core/Logger.h"
#include <windows.h>
#include <iostream>
#include <ctime>
#include <iomanip>
#include <filesystem>

namespace fs = std::filesystem;

// Static member initialization
std::mutex Logger::mutex_;
std::ofstream Logger::fileStream_;
std::string Logger::logDir_;
size_t Logger::maxFileBytes_ = 10 * 1024 * 1024; // 10 MB default
int Logger::maxFiles_ = 5;
size_t Logger::currentFileSize_ = 0;
bool Logger::initialized_ = false;

void Logger::Initialize(const std::string& logDir, size_t maxFileBytes, int maxFiles) {
    std::lock_guard<std::mutex> lock(mutex_);

    logDir_ = logDir;
    maxFileBytes_ = maxFileBytes;
    maxFiles_ = maxFiles;

    // Create log directory if it doesn't exist
    try {
        if (!logDir_.empty() && !fs::exists(logDir_)) {
            fs::create_directories(logDir_);
        }
    } catch (...) {
        // Fall through — will try to open file anyway
    }

    // Open or append to current log file
    std::string logPath = GetLogFilePath(0);
    fileStream_.open(logPath, std::ios::app | std::ios::ate);
    if (fileStream_.is_open()) {
        currentFileSize_ = static_cast<size_t>(fileStream_.tellp());
        initialized_ = true;
    }
}

void Logger::Shutdown() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (fileStream_.is_open()) {
        fileStream_.flush();
        fileStream_.close();
    }
    initialized_ = false;
}

std::string Logger::GetLogFilePath(int index) {
    return logDir_ + "\\agent_log_" + std::to_string(index) + ".txt";
}

void Logger::RotateIfNeeded() {
    // Called under lock
    if (currentFileSize_ < maxFileBytes_) return;

    fileStream_.flush();
    fileStream_.close();

    // Delete oldest file
    std::string oldest = GetLogFilePath(maxFiles_ - 1);
    try {
        if (fs::exists(oldest)) {
            fs::remove(oldest);
        }
    } catch (...) {}

    // Shift files: _3 -> _4, _2 -> _3, _1 -> _2, _0 -> _1
    for (int i = maxFiles_ - 2; i >= 0; --i) {
        std::string src = GetLogFilePath(i);
        std::string dst = GetLogFilePath(i + 1);
        try {
            if (fs::exists(src)) {
                fs::rename(src, dst);
            }
        } catch (...) {}
    }

    // Open fresh _0
    std::string newPath = GetLogFilePath(0);
    fileStream_.open(newPath, std::ios::out | std::ios::trunc);
    currentFileSize_ = 0;
}

void Logger::WriteToFile(const std::string& message) {
    // Called under lock
    if (!initialized_ || !fileStream_.is_open()) return;

    fileStream_ << message;
    fileStream_.flush();
    currentFileSize_ += message.size();

    RotateIfNeeded();
}

void Logger::Log(LogLevel level, const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);

    
    std::time_t now = std::time(nullptr);
    struct tm localTime;
    localtime_s(&localTime, &now);

    std::stringstream ss;
    ss << "[" << std::put_time(&localTime, "%Y-%m-%d %H:%M:%S") << "] ";
    ss << "[" << LevelToString(level) << "] ";
    ss << message << "\n";

    std::string finalMsg = ss.str();

    
    OutputDebugStringA(finalMsg.c_str());

    
    std::cout << finalMsg;

    // Write to rotating log file
    WriteToFile(finalMsg);
}

void Logger::Debug(const std::string& message) { Log(LogLevel::Debug, message); }
void Logger::Info(const std::string& message) { Log(LogLevel::Info, message); }
void Logger::Warning(const std::string& message) { Log(LogLevel::Warning, message); }
void Logger::Error(const std::string& message) { Log(LogLevel::Error, message); }

std::string Logger::LevelToString(LogLevel level) {
    switch (level) {
        case LogLevel::Debug:   return "DEBUG";
        case LogLevel::Info:    return "INFO";
        case LogLevel::Warning: return "WARN";
        case LogLevel::Error:   return "ERROR";
        default:                return "UNKNOWN";
    }
}


