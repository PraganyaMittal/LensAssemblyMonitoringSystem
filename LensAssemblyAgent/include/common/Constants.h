#pragma once

namespace AgentConstants {

	// Timing constants
	constexpr int HEARTBEAT_INTERVAL_SECONDS = 15;
	constexpr int MAX_REGISTRATION_RETRIES = 3;
	constexpr int MAX_CONNECTION_FAILURES = 5;
	constexpr int RETRY_DELAY_SECONDS = 5;
	constexpr int FILE_MONITOR_INTERVAL_MS = 15000;
	constexpr int SYNC_SPREAD_TOTAL_DURATION_MS = 20000;

	// Yield monitoring
	constexpr int YIELD_FILE_STABILITY_SECONDS = 15;

	// Network defaults
	constexpr int DEFAULT_HTTP_PORT = 80;
	constexpr int DEFAULT_HTTPS_PORT = 443;
	inline constexpr const char* DEFAULT_IP_ADDRESS = "0.0.0.0";

	// File system constants
	inline constexpr const char* TEMP_FOLDER_NAME = "temp";
	inline constexpr const char* ZIP_EXTENSION = ".zip";
	inline constexpr const char* CONFIG_FILE_NAME = "..\\config\\agent_config.json";

	// Protocol identifiers
	inline constexpr const wchar_t* HTTP_PROTOCOL = L"http";
	inline constexpr const wchar_t* HTTPS_PROTOCOL = L"https";
	inline constexpr const wchar_t* PROTOCOL_SEPARATOR = L"://";

	// API endpoints — Registration & heartbeat
	inline constexpr const wchar_t* ENDPOINT_REGISTER = L"/api/agent/register";
	inline constexpr const wchar_t* ENDPOINT_HEARTBEAT = L"/api/agent/heartbeat";
	inline constexpr const wchar_t* ENDPOINT_UPDATE_IP = L"/api/agent/update-ip";
	inline constexpr const wchar_t* ENDPOINT_UPLOAD_CONFIG = L"/api/agent/config/upload";
	inline constexpr const wchar_t* ENDPOINT_GET_SETTINGS = L"/api/agent/settings";
	inline constexpr const wchar_t* ENDPOINT_DIAGNOSTICS = L"/api/agent/diagnostics";

	constexpr int DIAGNOSTICS_INTERVAL_SECONDS = 60;

	// API endpoints — Data sync
	inline constexpr const wchar_t* ENDPOINT_UPDATE_LOG = L"/api/agent/updatelog";
	inline constexpr const wchar_t* ENDPOINT_SYNC_LOGS = L"/api/agent/synclogs";
	inline constexpr const wchar_t* ENDPOINT_SYNC_MODELS = L"/api/agent/syncmodels";
	inline constexpr const wchar_t* ENDPOINT_COMMAND_RESULT = L"/api/agent/commandresult";
	inline constexpr const wchar_t* ENDPOINT_UPLOAD_MODEL = L"/api/agent/uploadmodelfile";
	inline constexpr const wchar_t* ENDPOINT_UPLOAD_LOG = L"/api/agent/uploadlog";

	// WebSocket / SignalR
	inline constexpr const wchar_t* ENDPOINT_AGENT_HUB = L"/agentHub";
	inline constexpr const char* SIGNALR_RECORD_SEPARATOR = "\x1e";

	// Command types — Config & model
	inline constexpr const char* COMMAND_UPDATE_CONFIG = "UpdateConfig";
	inline constexpr const char* COMMAND_UPLOAD_CONFIG = "UploadConfig";
	inline constexpr const char* COMMAND_CHANGE_MODEL = "ChangeModel";
	inline constexpr const char* COMMAND_UPLOAD_MODEL = "UploadModel";
	inline constexpr const char* COMMAND_DELETE_MODEL = "DeleteModel";
	inline constexpr const char* COMMAND_DOWNLOAD_MODEL = "DownloadModel";

	// Command types — Agent management
	inline constexpr const char* COMMAND_UPDATE_AGENT_SETTINGS = "UpdateAgentSettings";
	inline constexpr const char* COMMAND_RESET_AGENT = "ResetAgent";

	// Command types — Deployment & rollback
	inline constexpr const char* COMMAND_UPDATE_BUNDLE = "UpdateBundle";
	inline constexpr const char* COMMAND_DEPLOY_BUNDLE = "DeployBundle";
	inline constexpr const char* COMMAND_DEPLOY_LAI = "DeployLAI";
	inline constexpr const char* COMMAND_ROLLBACK_BUNDLE = "RollbackBundle";
	inline constexpr const char* COMMAND_ROLLBACK_LAI = "RollbackLAI";

	// Command types — Lifecycle
	inline constexpr const char* COMMAND_DECOMMISSION = "DecommissionAgent";

	// Windows Service name (used for SCM queries)
	inline constexpr const wchar_t* SERVICE_NAME = L"LensAssemblyService";

	// Sibling exe names (used for version lookups in HeartbeatService)
	inline constexpr const char* SERVICE_EXE_NAME = "LensAssemblyService.exe";
	inline constexpr const char* UPDATER_EXE_NAME = "LensAssemblyAutoUpdater.exe";
	inline constexpr const char* LAI_EXE_NAME = "LensAssy.exe";

	// Directory names
	inline constexpr const char* UPDATE_FOLDER_NAME = "update";
	inline constexpr const char* BUNDLE_FOLDER_NAME = "Bundle";
	inline constexpr const char* LAI_FOLDER_NAME = "LAI";
	inline constexpr const char* AGENT_FOLDER_NAME = "Agent";
	inline constexpr const char* BACKUP_FOLDER_NAME = "backup";
	inline constexpr const char* DEFAULT_INSTALL_DIR = "C:\\LAMS_Dirs\\";

	// Subdirectory paths
	inline constexpr const char* UPDATE_BUNDLE_SUBDIR = "update\\Bundle\\";
	inline constexpr const char* UPDATE_LAI_SUBDIR = "update\\LAI\\";
	inline constexpr const char* BACKUP_BUNDLE_SUBDIR = "backup\\Bundle\\";
	inline constexpr const char* BACKUP_LAI_SUBDIR = "backup\\LAI\\";

	// Status strings
	inline constexpr const char* STATUS_IN_PROGRESS = "InProgress";
	inline constexpr const char* STATUS_DOWNLOADING = "Downloading";
	inline constexpr const char* STATUS_INSTALLING = "Installing";
	inline constexpr const char* STATUS_COMPLETED = "Completed";
	inline constexpr const char* STATUS_FAILED = "Failed";

	// UI constants
	inline constexpr const wchar_t* WINDOW_CLASS_NAME = L"LensAssemblyAgentClass";
	inline constexpr const wchar_t* WINDOW_TITLE = L"Factory Agent";
	inline constexpr const wchar_t* TRAY_TITLE_CONNECTED = L"Factory Agent - Connected";
	inline constexpr const wchar_t* TRAY_TITLE_DISCONNECTED = L"Factory Agent - Disconnected";

	// Error messages
	inline constexpr const wchar_t* ERROR_TITLE_CONNECTION_FAILED = L"Server Connection Failed";
	inline constexpr const wchar_t* ERROR_TITLE_CONNECTION_LOST = L"Server Connection Lost";
	inline constexpr const wchar_t* ERROR_MSG_CANNOT_CONNECT =
		L"Cannot connect to server. The agent has failed to connect multiple times.\n\n"
		L"Click 'Retry' to try connecting again.\n"
		L"Click 'Cancel' to exit the application.";
	inline constexpr const wchar_t* ERROR_MSG_CONNECTION_LOST =
		L"Lost connection to server. Heartbeat failed multiple times.\n\n"
		L"Click 'Retry' to reconnect.\n"
		L"Click 'Cancel' to exit the application.";

	// Size limits
	constexpr int MAX_PATH_LENGTH = 260;
	constexpr int MAX_HOSTNAME_LENGTH = 256;
	constexpr int MAX_IP_LENGTH = 16;
}