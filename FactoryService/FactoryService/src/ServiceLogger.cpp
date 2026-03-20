#include "pch.h"
#include "ServiceLogger.h"
#include <fstream>
#include <iostream>
#include <mutex>
#include <filesystem>
#include <chrono>

namespace fs = std::filesystem;

static std::mutex g_logMutex;
static std::ofstream g_logFile;

static std::string GetTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    struct tm buf;
    localtime_s(&buf, &time);
    char ts[32];
    strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", &buf);
    return std::string(ts);
}

void ServiceLogger::Init() {
    wchar_t modulePath[MAX_PATH];
    if (GetModuleFileNameW(NULL, modulePath, MAX_PATH)) {
        fs::path exePath(modulePath);
        
        fs::path baseDir = exePath.parent_path().parent_path(); 
        fs::path logDir = baseDir / L"logs";
        
        try {
            fs::create_directories(logDir);
            g_logFile.open(logDir / L"pipeserver_log.txt", std::ios::app);
        } catch (...) {}
    }
}

void ServiceLogger::Info(const std::string& msg) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    std::string line = "[" + GetTimestamp() + "] [INFO] " + msg;
    std::cout << line << std::endl;
    if (g_logFile.is_open()) {
        g_logFile << line << std::endl;
        g_logFile.flush();
    }
}

void ServiceLogger::Error(const std::string& msg) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    std::string line = "[" + GetTimestamp() + "] [ERROR] " + msg;
    std::cerr << line << std::endl;
    if (g_logFile.is_open()) {
        g_logFile << line << std::endl;
        g_logFile.flush();
    }
}
