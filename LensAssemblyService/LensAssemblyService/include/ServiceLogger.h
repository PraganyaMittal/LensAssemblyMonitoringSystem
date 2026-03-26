#pragma once
#include <string>
#include <sstream>

class ServiceLogger {
public:
	static void Init();
	static void Info(const std::string& msg);
	static void Error(const std::string& msg);
};

#define PIPE_LOG_INFO(msg) do { std::stringstream ss; ss << msg; ServiceLogger::Info(ss.str()); } while(0)
#define PIPE_LOG_ERROR(msg) do { std::stringstream ss; ss << msg; ServiceLogger::Error(ss.str()); } while(0)
