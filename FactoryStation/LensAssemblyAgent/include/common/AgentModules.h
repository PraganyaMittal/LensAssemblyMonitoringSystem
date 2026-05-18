#pragma once





enum class AgentModule {
	Core,
	Heartbeat,
	Registration,
	CommandExecutor,
	WebSocket,
	ConfigService,
	ModelService,
	LogStructureSync,
	ImageService,
	SyncWorker,
	YieldMonitor,
	Diagnostics,
	CrashDumper,
	ProcessMonitor,
	ResourceGovernor,
	ConfigFileWatcher,
	TrayIcon,
	Deploy
};

inline constexpr const char* AgentModuleStr(AgentModule m) {
	switch (m) {
		case AgentModule::Core:              return "Core";
		case AgentModule::Heartbeat:         return "Heartbeat";
		case AgentModule::Registration:      return "Registration";
		case AgentModule::CommandExecutor:   return "CommandExecutor";
		case AgentModule::WebSocket:         return "WebSocket";
		case AgentModule::ConfigService:     return "ConfigService";
		case AgentModule::ModelService:      return "ModelService";
		case AgentModule::LogStructureSync:  return "LogStructureSync";
		case AgentModule::ImageService:      return "ImageService";
		case AgentModule::SyncWorker:        return "SyncWorker";
		case AgentModule::YieldMonitor:      return "YieldMonitor";
		case AgentModule::Diagnostics:       return "Diagnostics";
		case AgentModule::CrashDumper:       return "CrashDumper";
		case AgentModule::ProcessMonitor:    return "ProcessMonitor";
		case AgentModule::ResourceGovernor:  return "ResourceGovernor";
		case AgentModule::ConfigFileWatcher: return "ConfigFileWatcher";
		case AgentModule::TrayIcon:          return "TrayIcon";
		case AgentModule::Deploy:            return "Deploy";
		default:                             return "Unknown";
	}
}
