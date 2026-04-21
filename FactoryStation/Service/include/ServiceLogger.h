#pragma once
#include <string>
#include <sstream>
#include <LogEngine.h>
#include "ServiceModules.h"

// Backward-compatible logging macros that wrap LogEngine to support << syntax
// Defaulting to ServiceModule::Core. If a specific module is needed, consumers
// can use LogEngine::Info directly, but the macros are preserved for fast migration.

#define PIPE_LOG_INFO(msg) \
	do { \
		std::stringstream ss; \
		ss << msg; \
		LogEngine::Info(ServiceModuleStr(ServiceModule::Core), ss.str()); \
	} while(0)

#define PIPE_LOG_ERROR(msg) \
	do { \
		std::stringstream ss; \
		ss << msg; \
		LogEngine::Error(ServiceModuleStr(ServiceModule::Core), ss.str()); \
	} while(0)
