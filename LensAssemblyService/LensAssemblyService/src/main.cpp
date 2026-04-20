#include "pch.h"
#include "PipeProtocol.h"
#include "PipeHandler.h"
#include "UpdateSpawner.h"
#include "ServiceLogger.h"
#include "ServiceConfig.h"
#include "AgentWatchdog.h"
#include "ServiceStagingPipeline.h"
#include "ServiceHttpClient.h"
#include "ExeNames.h"
#include <fstream>

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

	// Register with SCM using service name (strip .exe — SCM names don't have extensions)
	std::wstring scmName = g_Config.serviceExeName;
	if (scmName.size() > 4 && scmName.substr(scmName.size() - 4) == L".exe") {
		scmName = scmName.substr(0, scmName.size() - 4);
	}
	g_StatusHandle = RegisterServiceCtrlHandlerW(scmName.c_str(), ServiceCtrlHandler);
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

		pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_ACK));

		DeployRequest req;
		req.type        = PipeProtocol::ExtractJsonValue(payload, "type");
		req.sharedPath  = PipeProtocol::ExtractJsonValue(payload, "sharedPath");
		req.packageName = PipeProtocol::ExtractJsonValue(payload, "packageName");
		req.version     = PipeProtocol::ExtractJsonValue(payload, "version");
		req.fileHash    = PipeProtocol::ExtractJsonValue(payload, "fileHash");
		req.shareUser   = PipeProtocol::ExtractJsonValue(payload, "shareUser");
		req.sharePass   = PipeProtocol::ExtractJsonValue(payload, "sharePass");

		std::string cmdIdStr = PipeProtocol::ExtractJsonValue(payload, "commandId");
		try { req.commandId = std::stoi(cmdIdStr); } catch (...) { req.commandId = 0; }

		req.isRollback = (req.type.find("Rollback") != std::string::npos);

		PIPE_LOG_INFO("[Service] Deploy: type=" << req.type << " version=" << req.version
			<< " baseDir=" << ServiceConfig::WtoA(g_Config.baseDir));

		bool isBundle = (req.type.find("Bundle") != std::string::npos);

		try {
			if (!req.isRollback && req.sharedPath.empty()) {
				PIPE_LOG_ERROR("[Service] Non-rollback deploy missing sharedPath! Aborting.");
				return;
			}

			if (!pipeline.Execute(req)) {
				PIPE_LOG_ERROR("[Service] Staging pipeline failed for " << req.type);
				return;
			}

			if (isBundle) {
				if (!UpdateSpawner::UpdateUpdaterExe(g_Config, g_Config.baseDir, req.isRollback)) {
					PIPE_LOG_ERROR("[Service] Failed to update AutoUpdater exe. Aborting.");
					return;
				}
			}

			if (!UpdateSpawner::SpawnAutoUpdater(g_Config, req, isBundle ? g_StopEvent : NULL)) {
				PIPE_LOG_ERROR("[Service] Failed to spawn AutoUpdater. Error: " << GetLastError());
				return;
			}

			PIPE_LOG_INFO("[Service] AutoUpdater spawned. Update process started.");
		} catch (const std::exception& ex) {
			PIPE_LOG_ERROR("[Service] CRITICAL: Unhandled exception during deploy: " << ex.what());
		} catch (...) {
			PIPE_LOG_ERROR("[Service] CRITICAL: Unknown exception during deploy.");
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

	// ── Crash Recovery Check ──
	// If a stale .update_manifest exists, a previous update/rollback was interrupted
	// (e.g., power loss during file replacement). Spawn AutoUpdater in recovery mode
	// to restore the machine to a consistent state before accepting new commands.
	{
		std::wstring manifestPath = g_Config.baseDir + L"update\\.update_manifest";
		if (std::filesystem::exists(manifestPath)) {
			PIPE_LOG_INFO("[Service] *** STALE MANIFEST DETECTED ***");
			PIPE_LOG_INFO("[Service] A previous update/rollback was interrupted. Spawning recovery...");

			// Build a minimal DeployRequest for recovery spawn
			DeployRequest recoveryReq;
			recoveryReq.type = "RecoveryBundle";  // Determines type in SpawnAutoUpdater
			recoveryReq.isRollback = false;
			recoveryReq.commandId = 0;

			// Spawn AutoUpdater with --recover flag
			// We construct the command line manually for recovery since SpawnAutoUpdater
			// doesn't have a recovery mode yet — we add the flag here
			std::wstring updaterPath = g_Config.baseDir + L"Bundle\\" + g_Config.updaterExe;
			if (std::filesystem::exists(updaterPath)) {
				std::wstring safeBaseDir = g_Config.baseDir;
				while (!safeBaseDir.empty() && safeBaseDir.back() == L'\\') safeBaseDir.pop_back();

				std::wstring cmdLine = L"\"" + updaterPath + L"\"";
				cmdLine += L" --base-dir \"" + safeBaseDir + L"\"";
				cmdLine += L" --type Bundle";
				cmdLine += L" --recover";

				std::vector<wchar_t> cmdBuf(cmdLine.begin(), cmdLine.end());
				cmdBuf.push_back(L'\0');

				STARTUPINFOW si = {};
				si.cb = sizeof(si);
				PROCESS_INFORMATION pi = {};

				if (CreateProcessW(updaterPath.c_str(), cmdBuf.data(), NULL, NULL, FALSE,
					CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
					PIPE_LOG_INFO("[Service] Recovery AutoUpdater spawned (PID: " << pi.dwProcessId << "). Waiting...");
					WaitForSingleObject(pi.hProcess, 60000);  // Wait up to 60s for recovery
					DWORD exitCode = 0;
					GetExitCodeProcess(pi.hProcess, &exitCode);
					CloseHandle(pi.hProcess);
					CloseHandle(pi.hThread);
					PIPE_LOG_INFO("[Service] Recovery complete. Exit code: " << exitCode);
				} else {
					PIPE_LOG_ERROR("[Service] Failed to spawn recovery AutoUpdater. Error: " << GetLastError());
				}
			} else {
				PIPE_LOG_ERROR("[Service] AutoUpdater not found for recovery. Manual intervention required.");
				// Try to clean up the stale manifest
				try { std::filesystem::remove(manifestPath); } catch (...) {}
			}
		}
	}

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
	std::wstring serviceName = SERVICE_SCM_NAME_W;  // from ExeNames.h
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
