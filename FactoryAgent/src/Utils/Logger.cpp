#include "../../include/Utils/Logger.h"
#include <windows.h>
#include <iostream>
#include <ctime>
#include <iomanip>

namespace FactoryAgent {
namespace Utils {

std::mutex Logger::mutex_;

void Logger::Log(LogLevel level, const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Format timestamp
    std::time_t now = std::time(nullptr);
    struct tm localTime;
    localtime_s(&localTime, &now);

    std::stringstream ss;
    ss << "[" << std::put_time(&localTime, "%Y-%m-%d %H:%M:%S") << "] ";
    ss << "[" << LevelToString(level) << "] ";
    ss << message << "\n";

    std::string finalMsg = ss.str();

    // 1. Output to Debug Console (Visual Studio)
    OutputDebugStringA(finalMsg.c_str());

    // 2. Output to Console (if attached)
    std::cout << finalMsg;

    // 3. (Optional) File logging could go here
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

} // namespace Utils
} // namespace FactoryAgent
