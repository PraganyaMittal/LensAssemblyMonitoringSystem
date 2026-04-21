#pragma once

/// UpdaterModule — Enum identifying source modules in AutoUpdater log entries.
/// Usage: LogEngine::Info(UpdaterModuleStr(UpdaterModule::Orchestrator), "message");

enum class UpdaterModule {
	Core,
	Orchestrator,
	ProcessController,
	FileReplacer,
	BackupManager,
	HealthChecker,
	BundleStrategy,
	LaiStrategy,
	Recovery
};

inline constexpr const char* UpdaterModuleStr(UpdaterModule m) {
	switch (m) {
		case UpdaterModule::Core:              return "Core";
		case UpdaterModule::Orchestrator:      return "Orchestrator";
		case UpdaterModule::ProcessController: return "ProcessController";
		case UpdaterModule::FileReplacer:      return "FileReplacer";
		case UpdaterModule::BackupManager:     return "BackupManager";
		case UpdaterModule::HealthChecker:     return "HealthChecker";
		case UpdaterModule::BundleStrategy:    return "BundleStrategy";
		case UpdaterModule::LaiStrategy:       return "LaiStrategy";
		case UpdaterModule::Recovery:          return "Recovery";
		default:                               return "Unknown";
	}
}
