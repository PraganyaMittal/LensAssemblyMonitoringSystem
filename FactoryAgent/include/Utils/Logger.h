#pragma once

#include <string>
#include <sstream>
#include <mutex>

namespace FactoryAgent {
namespace Utils {

enum class LogLevel {
    Debug,
    Info,
    Warning,
    Error
};

class Logger {
public:
    static void Log(LogLevel level, const std::string& message);
    
    // Helper methods
    static void Debug(const std::string& message);
    static void Info(const std::string& message);
    static void Warning(const std::string& message);
    static void Error(const std::string& message);

    // Template support for formatted strings if needed, but keeping it simple for now
    
private:
    static std::string LevelToString(LogLevel level);
    static std::mutex mutex_;
};

} // namespace Utils
} // namespace FactoryAgent
