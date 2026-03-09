#ifndef CONSTANTS_H
#define CONSTANTS_H

namespace AgentConstants {

    /* Timing constants */
    const int HEARTBEAT_INTERVAL_SECONDS = 15;
    const int MAX_REGISTRATION_RETRIES = 3;
    const int MAX_CONNECTION_FAILURES = 5;
    const int RETRY_DELAY_SECONDS = 5;
    const int FILE_MONITOR_INTERVAL_MS = 15000;
    const int SYNC_SPREAD_TOTAL_DURATION_MS = 20000;

    // Yield: seconds a file must be unchanged before reporting (tray-complete detection)
    const int YIELD_FILE_STABILITY_SECONDS = 15;

    /* Network constants */
    const int DEFAULT_HTTP_PORT = 80;
    const int DEFAULT_HTTPS_PORT = 443;
    const char* const DEFAULT_IP_ADDRESS = "0.0.0.0";

    /* File system constants */
    const char* const TEMP_FOLDER_NAME = "temp";
    const char* const ZIP_EXTENSION = ".zip";
    const char* const CONFIG_FILE_NAME = "agent_config.json";

    /* Protocol constants */
    const wchar_t* const HTTP_PROTOCOL = L"http";
    const wchar_t* const HTTPS_PROTOCOL = L"https";
    const wchar_t* const PROTOCOL_SEPARATOR = L"://";

    /* API Endpoints */
    const wchar_t* const ENDPOINT_REGISTER = L"/api/agent/register";
    const wchar_t* const ENDPOINT_HEARTBEAT = L"/api/agent/heartbeat";
    const wchar_t* const ENDPOINT_UPDATE_IP = L"/api/agent/update-ip";
    const wchar_t* const ENDPOINT_UPLOAD_CONFIG = L"/api/agent-legacy/uploadconfig";
    const wchar_t* const ENDPOINT_GET_SETTINGS = L"/api/agent/settings";

    // Legacy file names
    const wchar_t* const ENDPOINT_UPDATE_LOG = L"/api/agent/updatelog";
    const wchar_t* const ENDPOINT_SYNC_LOGS = L"/api/agent/synclogs";
    const wchar_t* const ENDPOINT_SYNC_MODELS = L"/api/agent/syncmodels";
    const wchar_t* const ENDPOINT_COMMAND_RESULT = L"/api/agent/commandresult";
    const wchar_t* const ENDPOINT_UPLOAD_MODEL = L"/api/agent/uploadmodelfile";
    const wchar_t* const ENDPOINT_UPLOAD_LOG = L"/api/agent/uploadlog";

    /* WebSocket & SignalR */
    const wchar_t* const ENDPOINT_AGENT_HUB = L"/agentHub";
    const char* const SIGNALR_RECORD_SEPARATOR = "\x1e";

    /* Command types */
    const char* const COMMAND_UPDATE_CONFIG = "UpdateConfig";
    const char* const COMMAND_UPLOAD_CONFIG = "UploadConfig";
    const char* const COMMAND_CHANGE_MODEL = "ChangeModel";
    const char* const COMMAND_UPLOAD_MODEL = "UploadModel";
    const char* const COMMAND_DELETE_MODEL = "DeleteModel";
    const char* const COMMAND_DOWNLOAD_MODEL = "DownloadModel";

    // [MOVED HERE FOR CONSISTENCY]
    const char* const COMMAND_UPDATE_AGENT_SETTINGS = "UpdateAgentSettings";
    const char* const COMMAND_RESET_AGENT = "ResetAgent";

    /* Status values */
    const char* const STATUS_IN_PROGRESS = "InProgress";
    const char* const STATUS_COMPLETED = "Completed";
    const char* const STATUS_FAILED = "Failed";

    /* UI constants */
    const wchar_t* const WINDOW_CLASS_NAME = L"FactoryAgentClass";
    const wchar_t* const WINDOW_TITLE = L"Factory Agent";
    const wchar_t* const TRAY_TITLE_CONNECTED = L"Factory Agent - Connected";
    const wchar_t* const TRAY_TITLE_DISCONNECTED = L"Factory Agent - Disconnected";

    /* Error messages */
    const wchar_t* const ERROR_TITLE_CONNECTION_FAILED = L"Server Connection Failed";
    const wchar_t* const ERROR_TITLE_CONNECTION_LOST = L"Server Connection Lost";
    const wchar_t* const ERROR_MSG_CANNOT_CONNECT =
        L"Cannot connect to server. The agent has failed to connect multiple times.\n\n"
        L"Click 'Retry' to try connecting again.\n"
        L"Click 'Cancel' to exit the application.";
    const wchar_t* const ERROR_MSG_CONNECTION_LOST =
        L"Lost connection to server. Heartbeat failed multiple times.\n\n"
        L"Click 'Retry' to reconnect.\n"
        L"Click 'Cancel' to exit the application.";

    /* Buffer sizes */
    const int MAX_PATH_LENGTH = 260;
    const int MAX_HOSTNAME_LENGTH = 256;
    const int MAX_IP_LENGTH = 16;
}

#endif