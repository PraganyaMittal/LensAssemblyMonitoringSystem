#include "pch.h"
#include "PipeProtocol.h"
#include "PipeHandler.h"
#include "UpdateSpawner.h"
#include "ServiceLogger.h"
#include "ServiceConfig.h"
#include "AgentWatchdog.h"
#include "ServiceStagingPipeline.h"
#include "ServiceHttpClient.h"

// ── Globals ──
SERVICE_STATUS        g_ServiceStatus = {};
SERVICE_STATUS_HANDLE g_StatusHandle  = NULL;
HANDLE                g_StopEvent     = NULL;
HANDLE                g_ServiceThread = NULL;
ServiceConfig         g_Config;

// Forward declarations
void RunServiceLogic();

// ── Service Control Handler ──
void WINAPI ServiceCtrlHandler(DWORD ctrlCode) {
	if (ctrlCode == SERVICE_CONTROL_STOP) {
		g_ServiceStatus.dwCurrentState = SERVICE_STOP_PENDING;
		SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
		SetEvent(g_StopEvent);
		if (g_ServiceThread) {
			CancelSynchronousIo(g_ServiceThread);
		}
	} else if (ctrlCode == SERVICE_CONTROL_INTERROGATE) {
		SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
	}
}

// ── Service Main ──
void WINAPI ServiceMain(DWORD argc, LPWSTR* argv) {
	ServiceLogger::Init();

	// Load configuration from service_config.json
	if (!g_Config.LoadFromFile()) {
		PIPE_LOG_ERROR("[Service] Failed to load service_config.json! Service cannot start.");
		return;
	}

	PIPE_LOG_INFO("[Service] Config loaded. BaseDir: " << ServiceConfig::WtoA(g_Config.baseDir));
	PIPE_LOG_INFO("[Service] ServerUrl: " << ServiceConfig::WtoA(g_Config.serverUrl));
	PIPE_LOG_INFO("[Service] AgentExe: " << ServiceConfig::WtoA(g_Config.agentExe));

	// Bootstrap directory tree — creates Bundle, LAI, update, backup, logs
	g_Config.EnsureDirectoryTree();
	PIPE_LOG_INFO("[Service] Directory tree verified.");

	// Register with SCM using service name from config
	g_StatusHandle = RegisterServiceCtrlHandlerW(g_Config.serviceExeName.c_str(), ServiceCtrlHandler);
	if (!g_StatusHandle) return;

	g_ServiceStatus.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
	g_ServiceStatus.dwCurrentState = SERVICE_START_PENDING;
	SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

	g_StopEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
	if (!g_StopEvent) {
		g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
		SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
		return;
	}

	DuplicateHandle(
		GetCurrentProcess(), GetCurrentThread(),
		GetCurrentProcess(), &g_ServiceThread,
		0, FALSE, DUPLICATE_SAME_ACCESS
	);

	g_ServiceStatus.dwCurrentState = SERVICE_RUNNING;
	g_ServiceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP;
	SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

	RunServiceLogic();

	if (g_StopEvent) { CloseHandle(g_StopEvent); g_StopEvent = NULL; }
	if (g_ServiceThread) { CloseHandle(g_ServiceThread); g_ServiceThread = NULL; }
	g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
	SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
}

// ── Process DEPLOY_REQUEST from Agent ──
void ProcessMessage(const std::string& message, PipeHandler& pipe,
                    AgentWatchdog& watchdog, ServiceStagingPipeline& pipeline) {
	std::string command = PipeProtocol::ParseCommand(message);
	std::string payload = PipeProtocol::ParsePayload(message);

	if (command == PipeProtocol::CMD_DEPLOY_REQUEST) {
		PIPE_LOG_INFO("[Service] Received DEPLOY_REQUEST from Agent.");

		// 1. ACK immediately so agent can exit
		pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK));

		// 2. Parse deploy request
		DeployRequest req;
		req.type        = PipeProtocol::ExtractJsonValue(payload, "type");
		req.sharedPath  = PipeProtocol::ExtractJsonValue(payload, "sharedPath");
		req.packageName = PipeProtocol::ExtractJsonValue(payload, "packageName");
		req.version     = PipeProtocol::ExtractJsonValue(payload, "version");
		req.fileHash    = PipeProtocol::ExtractJsonValue(payload, "fileHash");

		std::string cmdIdStr = PipeProtocol::ExtractJsonValue(payload, "commandId");
		try { req.commandId = std::stoi(cmdIdStr); } catch (...) { req.commandId = 0; }

		req.isRollback = (req.type.find("Rollback") != std::string::npos);

		PIPE_LOG_INFO("[Service] Deploy: type=" << req.type << " version=" << req.version
			<< " baseDir=" << ServiceConfig::WtoA(g_Config.baseDir));

		// 3. Suppress agent restart (agent is about to self-exit)
		watchdog.SuppressRestart("update_in_progress:" + req.type);

		// Safety net: catch ANY exception so the service never crashes during deploy.
		// An uncaught exception here calls std::terminate() → abort() → process killed
		// → SCM restart → all deploy state lost → update dead.
		try {
			// 4. Run staging pipeline (download from shared path, verify, extract)
			if (!req.isRollback && req.sharedPath.empty()) {
				PIPE_LOG_ERROR("[Service] Non-rollback deploy missing sharedPath! Aborting.");
				watchdog.AllowRestart();
				return;
			}

			if (!pipeline.Execute(req)) {
				PIPE_LOG_ERROR("[Service] Staging pipeline failed for " << req.type);
				watchdog.AllowRestart();
				return;
			}

			// 5. Update AutoUpdater.exe if this is a bundle update
			bool isBundle = (req.type.find("Bundle") != std::string::npos);

			if (isBundle) {
				if (!UpdateSpawner::UpdateUpdaterExe(g_Config, g_Config.baseDir)) {
					PIPE_LOG_ERROR("[Service] Failed to update AutoUpdater.exe. Aborting.");
					watchdog.AllowRestart();
					return;
				}
			}

			// 6. Spawn AutoUpdater with all paths as cmd line args
			if (!UpdateSpawner::SpawnAutoUpdater(g_Config, req, isBundle ? g_StopEvent : NULL)) {
				PIPE_LOG_ERROR("[Service] Failed to spawn AutoUpdater. Error: " << GetLastError());
				watchdog.AllowRestart();
				return;
			}

			PIPE_LOG_INFO("[Service] AutoUpdater spawned. Update process started.");

			// For LAI updates (service stays running), allow restart after updater finishes
			// For bundle updates, service will be stopped and restarted (flag resets naturally)
			if (!isBundle) {
				// Start a detached thread to wait for updater to finish, then allow restart
				std::thread([&watchdog, updaterExe = g_Config.updaterExe]() {
					// Wait up to 10 minutes for updater to finish
					for (int i = 0; i < 600; i++) {
						Sleep(1000);
						if (!UpdateSpawner::IsUpdaterRunning(updaterExe)) {
							break;
						}
					}
					watchdog.AllowRestart();
				}).detach();
			}
		} catch (const std::exception& ex) {
			PIPE_LOG_ERROR("[Service] CRITICAL: Unhandled exception during deploy: " << ex.what());
			watchdog.AllowRestart();
		} catch (...) {
			PIPE_LOG_ERROR("[Service] CRITICAL: Unknown exception during deploy.");
			watchdog.AllowRestart();
		}
	}
	else {
		PIPE_LOG_INFO("[Service] Unknown command: " << command);
		pipe.WriteMessage(PipeProtocol::MakeResponse(PipeProtocol::CMD_ERROR, "UNKNOWN_COMMAND"));
	}
}

// ── Main Service Logic ──
void RunServiceLogic() {
	PIPE_LOG_INFO("========================================");
	PIPE_LOG_INFO("  Factory Update Service");
	PIPE_LOG_INFO("========================================");

	// Initialize components
	ServiceHttpClient httpClient(g_Config.serverUrl);
	AgentWatchdog watchdog(g_Config);
	ServiceStagingPipeline pipeline(g_Config, &httpClient);

	// Start Agent health check thread (15-second poll)
	watchdog.Start(g_StopEvent);

	// Create named pipe server
	PipeHandler pipe;
	if (!pipe.CreatePipe()) {
		PIPE_LOG_ERROR("[Service] Failed to create pipe. Stopping.");
		watchdog.Stop();
		return;
	}

	// Main service loop: wait for agent connections and process messages
	while (WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
		PIPE_LOG_INFO("\n[Service] Waiting for agent connection...");

		int result = pipe.WaitForClient();

		if (result == 1) break;       // Stop event signaled

		if (result == -1) {           // Error
			std::this_thread::sleep_for(std::chrono::seconds(1));
			continue;
		}

		PIPE_LOG_INFO("[Service] Agent connected.");

		bool active = true;
		while (active && WaitForSingleObject(g_StopEvent, 0) != WAIT_OBJECT_0) {
			std::string message = pipe.ReadMessage();

			if (message.empty()) {
				PIPE_LOG_INFO("[Service] Agent disconnected.");
				active = false;
				continue;
			}

			ProcessMessage(message, pipe, watchdog, pipeline);
		}

		pipe.DisconnectClient();
	}

	PIPE_LOG_INFO("[Service] Stopping...");
	watchdog.Stop();
	pipe.Cleanup();
}

// ── Entry Point ──
int wmain(int argc, wchar_t* argv[]) {
	// Try to load config early to get service name (needed for SCM registration)
	ServiceConfig earlyConfig;
	std::wstring serviceName = L"LensAssemblyService";  // fallback default
	if (earlyConfig.LoadFromFile()) {
		serviceName = earlyConfig.serviceExeName;
		// Remove .exe extension if present for service name
		if (serviceName.size() > 4 && serviceName.substr(serviceName.size() - 4) == L".exe") {
			serviceName = serviceName.substr(0, serviceName.size() - 4);
		}
	}

	SERVICE_TABLE_ENTRYW table[] = {
		{ (LPWSTR)serviceName.c_str(), ServiceMain },
		{ NULL, NULL }
	};

	if (!StartServiceCtrlDispatcherW(table)) {
		PIPE_LOG_INFO("[Service] Not started by SCM. Start via 'services.msc'.");
		return 1;
	}

	return 0;
}
