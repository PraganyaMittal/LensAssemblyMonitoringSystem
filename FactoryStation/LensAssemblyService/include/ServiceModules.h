#pragma once

/// ServiceModule — Enum identifying source modules in Service log entries.
/// Usage: LogEngine::Info(ServiceModuleStr(ServiceModule::Staging), "message");

enum class ServiceModule {
	Core,
	PipeHandler,
	Watchdog,
	Staging,
	UpdateSpawner,
	Recovery,
	Config
};

inline constexpr const char* ServiceModuleStr(ServiceModule m) {
	switch (m) {
		case ServiceModule::Core:           return "Core";
		case ServiceModule::PipeHandler:    return "PipeHandler";
		case ServiceModule::Watchdog:       return "Watchdog";
		case ServiceModule::Staging:        return "Staging";
		case ServiceModule::UpdateSpawner:  return "UpdateSpawner";
		case ServiceModule::Recovery:       return "Recovery";
		case ServiceModule::Config:         return "Config";
		default:                            return "Unknown";
	}
}
