#pragma once

#include <string>
#include <sstream>
#include <mutex>


enum class LogLevel {
    Debug,
    Info,
    Warning,
    Error
};

class Logger {
public:
    static void Log(LogLevel level, const std::string& message);
    
    
    static void Debug(const std::string& message);
    static void Info(const std::string& message);
    static void Warning(const std::string& message);
    static void Error(const std::string& message);

    
    
private:
    static std::string LevelToString(LogLevel level);
    static std::mutex mutex_;
};


