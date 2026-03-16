#include "Utils/Logger.h"
#include <windows.h>
#include <iostream>
#include <ctime>
#include <iomanip>


std::mutex Logger::mutex_;

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


