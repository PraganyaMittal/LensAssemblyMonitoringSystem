#include "core/Logger.h"
#include <LogEngine.h>
#include "AgentModules.h"
#include "common/Constants.h"

std::atomic<int> Logger::errorCount_{0};

void Logger::Initialize(const std::string& baseDir) {
	std::string configPath = baseDir + "config\\log_config.json";
	LogEngine::Initialize(baseDir, configPath, "agent");
}

void Logger::Shutdown() {
	LogEngine::Shutdown();
}

void Logger::Log(LogLevel level, const std::string& message) {
	switch (level) {
		case LogLevel::Debug:
			// LogEngine doesn't have an explicit Debug level exposed by default, mapping to Info
			LogEngine::Info(AgentModuleStr(AgentModule::Core), message);
			break;
		case LogLevel::Info:
			LogEngine::Info(AgentModuleStr(AgentModule::Core), message);
			break;
		case LogLevel::Warning:
			LogEngine::Warning(AgentModuleStr(AgentModule::Core), message);
			break;
		case LogLevel::Error:
			LogEngine::Error(AgentModuleStr(AgentModule::Core), message);
			break;
	}
}

void Logger::Debug(const std::string& message) { Log(LogLevel::Debug, message); }
void Logger::Info(const std::string& message) { Log(LogLevel::Info, message); }
void Logger::Warning(const std::string& message) { Log(LogLevel::Warning, message); }
void Logger::Error(const std::string& message) { errorCount_.fetch_add(1); Log(LogLevel::Error, message); }
