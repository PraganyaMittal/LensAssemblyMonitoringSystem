#include "../include/core/AgentCore.h"
#include "../include/network/WebSocketClient.h"
#include "../include/services/RegistrationService.h"
#include "../include/services/HeartbeatService.h"
#include "../include/services/CommandExecutor.h"
#include "../include/services/ConfigService.h"
#include "../include/services/LogService.h"
#include "../include/services/ModelService.h"
#include "../include/services/ImageService.h"
#include "../include/services/PipeClient.h"
#include "../include/network/HttpClient.h"
#include "../include/monitoring/ConfigManager.h"
#include "../include/monitoring/ProcessMonitor.h"
#include "../include/monitoring/YieldMonitor.h"
#include "../include/monitoring/LogDirWatcher.h"
#include "../include/common/Constants.h"
#include "../include/utilities/NetworkUtils.h"
#include "../include/Utils/Logger.h"
#include "../../third_party/json/json.hpp"
#include <fstream>
#include <sstream>
#include <thread>
#include <chrono>

void UpdateConfigFile(const AgentSettings& settings) {
    try {
        json config;
        std::ifstream inFile(AgentConstants::CONFIG_FILE_NAME);
        if (inFile.is_open()) {
            inFile >> config;
            inFile.close();
        }

        config["mcId"] = settings.mcId;

        std::ofstream outFile(AgentConstants::CONFIG_FILE_NAME);
        outFile << config.dump(4);
    } catch (...) {}
}

using json = nlohmann::json;

AgentCore::AgentCore() {
    ipChangeHandle_ = NULL;
    workerThread_ = NULL;
    ipcThread_ = NULL;
    updateThread_ = NULL;
    isRunning_ = false;
    isRegistered_ = false;
    stopRequested_.store(false);
    connectionFailureCount_ = 0;
}

AgentCore::~AgentCore() {
    Stop();
}

bool AgentCore::Initialize(const AgentSettings& settings) {
    settings_ = settings;

    httpClient_.reset(new HttpClient(settings.serverUrl));
    webSocketClient_.reset(new FactoryAgent::Network::WebSocketClient(settings.serverUrl));
    registrationService_.reset(new RegistrationService());
    heartbeatService_.reset(new HeartbeatService());
    configManager_.reset(new ConfigManager());
    processMonitor_.reset(new ProcessMonitor());
    logDirWatcher_.reset(new LogDirWatcher());
    
    yieldMonitor_.reset(new YieldMonitor());
    yieldMonitor_->Initialize(
        settings.yieldMonitorPath, 
        settings.mcId, 
        std::to_wstring(settings.lineNumber), 
        std::to_wstring(settings.mcNumber),
        settings.serverUrl
    );

    configService_.reset(new ConfigService(&settings_, httpClient_.get(), configManager_.get()));
    logService_.reset(new LogService(&settings_, httpClient_.get()));
    modelService_.reset(new ModelService(&settings_, httpClient_.get(), configManager_.get()));
    imageService_.reset(new ImageService(&settings_, httpClient_.get()));
    // Initialize IPC client for managed lifecycle (auto-updates via PipeServer)
    // Must be created BEFORE CommandExecutor so it can use the pointer for NotifyUpdate
    pipeClient_.reset(new PipeClient());
    pipeClient_->SetShutdownCallback([this]() {
        // PipeServer requested shutdown for update — initiate graceful exit
        FactoryAgent::Utils::Logger::Info("[IPC] Server requested shutdown. Initiating graceful exit for update.");
        this->stopRequested_.store(true);

        // Post WM_CLOSE to the hidden window to exit the message loop
        HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
        if (hwnd) {
            PostMessage(hwnd, WM_CLOSE, 0, 0);
        }
    });

    commandExecutor_.reset(new CommandExecutor(httpClient_.get(), configService_.get(), modelService_.get(), pipeClient_.get()));

    return true;
}

void AgentCore::ReloadSettings(const AgentSettings& settings) {
    settings_ = settings;
}

void AgentCore::Start() {
    if (isRunning_) {
        return;
    }

    isRunning_ = true;
    stopRequested_.store(false);
    workerThread_ = CreateThread(NULL, 0, WorkerThreadProc, this, 0, NULL);
    
    // Start IPC connection to PipeServer on a background thread
    // Non-fatal: agent runs normally even if PipeServer is not available
    ipcThread_ = CreateThread(NULL, 0, IpcThreadProc, this, 0, NULL);

    updateThread_ = CreateThread(NULL, 0, UpdateThreadProc, this, 0, NULL);

    // Register IP Change Notification
    NotifyIpInterfaceChange(AF_INET, (PIPINTERFACE_CHANGE_CALLBACK)OnIpChange, this, FALSE, &ipChangeHandle_);

    if (yieldMonitor_) {
        yieldMonitor_->Start();
    }

    if (logDirWatcher_) {
        logDirWatcher_->Initialize(NetworkUtils::ConvertStringToWString(settings_.logFolderPath), [this]() {
            if (this->logService_) {
                this->logService_->TriggerAsyncSync();
            }
        });
        logDirWatcher_->Start();
    }
}

void AgentCore::Stop() {
    if (!isRunning_) {
        return;
    }
    stopRequested_.store(true);

    // Disconnect IPC client first to unblock the IPC thread
    if (pipeClient_) {
        pipeClient_->Disconnect();
    }

    if (webSocketClient_) {
        webSocketClient_->Stop();
    }
    
    // Unregister IP Change Notification
    if (ipChangeHandle_) {
        CancelMibChangeNotify2(ipChangeHandle_);
        ipChangeHandle_ = NULL;
    }

    if (logDirWatcher_) {
        logDirWatcher_->Stop();
    }

    if (yieldMonitor_) {
        yieldMonitor_->Stop();
    }

    if (workerThread_) {
        WaitForSingleObject(workerThread_, 5000);
        CloseHandle(workerThread_);
        workerThread_ = NULL;
    }

    // Wait for IPC thread to finish
    if (ipcThread_) {
        WaitForSingleObject(ipcThread_, 3000);
        CloseHandle(ipcThread_);
        ipcThread_ = NULL;
    }

    if (updateThread_) {
        WaitForSingleObject(updateThread_, 3000);
        CloseHandle(updateThread_);
        updateThread_ = NULL;
    }

    isRunning_ = false;
}

void CALLBACK AgentCore::OnIpChange(PVOID CallerContext, PMIB_IPINTERFACE_ROW Row, MIB_NOTIFICATION_TYPE NotificationType) {
    if (NotificationType != MibParameterNotification && NotificationType != MibAddInstance) {
        return;
    }

    AgentCore* core = static_cast<AgentCore*>(CallerContext);
    if (!core || !core->isRunning_) return;

    // Give the network stack a moment to settle
    Sleep(2000);

    std::string newIp = NetworkUtils::DetectIPAddress();
    if (!newIp.empty() && newIp != core->settings_.ipAddress) {
        core->settings_.ipAddress = newIp;
        UpdateConfigFile(core->settings_);
        core->ReportNewIp(newIp);
    }
}

void AgentCore::ReportNewIp(const std::string& newIp) {
    if (!httpClient_ || settings_.mcId <= 0) return;

    // Fire and forget on a detached thread
    int mcId = settings_.mcId;
    HttpClient* client = httpClient_.get();

    std::thread([client, mcId, newIp]() {
        try {
            json payload;
            payload["mcId"] = mcId;
            payload["currentIpAddress"] = newIp;

            json response;
            client->Post(AgentConstants::ENDPOINT_UPDATE_IP, payload, response);
        } catch (...) {
            // Ignore network errors on background update
        }
    }).detach();
}

bool AgentCore::IsRunning() const {
    return isRunning_;
}

AgentStatus AgentCore::GetStatus() const {
    AgentStatus status;
    status.isConnected = (isRegistered_ && connectionFailureCount_ == 0);
    status.mcId = settings_.mcId;
    status.lineNumber = settings_.lineNumber;
    status.connectionFailures = connectionFailureCount_;
    return status;
}

AgentSettings AgentCore::GetSettings() const {
    return settings_;
}

DWORD WINAPI AgentCore::WorkerThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->WorkerLoop();
    return 0;
}

// ── IPC Thread ─────────────────────────────────────────────────────────────

DWORD WINAPI AgentCore::IpcThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->IpcLoop();
    return 0;
}

void AgentCore::IpcLoop() {
    if (!pipeClient_) return;

    // Reconnection loop: if the service drops the connection (e.g., during
    // an update cycle or service restart), retry after a delay.
    while (!stopRequested_.load()) {
        if (!pipeClient_->Connect(30, 2000)) {
            FactoryAgent::Utils::Logger::Warning(
                "[IPC] Could not connect to update service. Will retry in 10 seconds.");
            
            // Wait 10 seconds before retrying (check stopRequested_ each second)
            for (int i = 0; i < 10 && !stopRequested_.load(); ++i) {
                Sleep(1000);
            }
            continue;
        }

        // Run the event loop — blocks until stopRequested_ is set,
        // server sends SHUTDOWN/UPDATE_NOW, or the connection drops.
        pipeClient_->RunLoop(stopRequested_);

        if (stopRequested_.load()) break;

        // Connection dropped but agent is still running — retry
        FactoryAgent::Utils::Logger::Info(
            "[IPC] Connection lost. Will reconnect in 5 seconds.");
        for (int i = 0; i < 5 && !stopRequested_.load(); ++i) {
            Sleep(1000);
        }
    }
}

// ── Update Thread ─────────────────────────────────────────────────────────────

DWORD WINAPI AgentCore::UpdateThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->UpdateLoop();
    return 0;
}

void AgentCore::UpdateLoop() {
    while (!stopRequested_) {
        // Sleep first, wait 15 seconds or stop
        for (int i = 0; i < 15 && !stopRequested_; ++i) {
            Sleep(1000);
        }

        if (stopRequested_ || !isRegistered_ || connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {
            continue;
        }

        if (httpClient_ && settings_.mcId > 0) {
            std::string url = "/api/agent-legacy/" + std::to_string(settings_.mcId) + "/commands";
            json response;
            
            try {
                if (httpClient_->Get(NetworkUtils::ConvertStringToWString(url), response) && response.is_array() && !response.empty()) {
                    FactoryAgent::Utils::Logger::Info("[UpdatePolling] Fetched " + std::to_string(response.size()) + " update commands.");
                    commandExecutor_->ProcessCommands(response);
                }
            }
            catch (const std::exception& e) {
                FactoryAgent::Utils::Logger::Error(std::string("[UpdatePolling] Error fetching commands: ") + e.what());
            }
        }
    }
}

void AgentCore::WorkerLoop() {
    bool registered = false;
    bool webSocketConnected = false;
    int registrationRetries = 0;

    while (!stopRequested_) {
        if (!registered) {
            if (registrationRetries < AgentConstants::MAX_REGISTRATION_RETRIES) {
                std::string errorMessage;
                
                if (settings_.mcId > 0) {
                    registered = registrationService_->FetchSettingsFromServer(&settings_, httpClient_.get(), errorMessage);
                } else {
                    registered = registrationService_->RegisterWithServer(&settings_, httpClient_.get(), errorMessage);
                }

                if (!registered) {
                    if (!errorMessage.empty() && errorMessage.find("Network error") == std::string::npos) {
                        // Hard rejection from server (e.g., duplicate line/pc conflict)
                        std::string msg = "Registration Failed:\n" + errorMessage + "\n\nThe application will now exit.";
                        MessageBoxA(NULL, msg.c_str(), "Registration Rejected", MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND);
                        
                        // Delete the configuration files so the user gets prompted to register again on restart
                        remove(AgentConstants::CONFIG_FILE_NAME);

                        HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
                        if (hwnd) {
                            PostMessage(hwnd, WM_CLOSE, 0, 0);
                        }

                        stopRequested_ = true;
                        isRunning_ = false;
                        return;
                    }

                    registrationRetries++;
                    connectionFailureCount_++;

                    if (connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {   
                        int result = MessageBoxA(NULL,
                            "Cannot connect to server. The agent has failed to connect multiple times.\n\n"
                            "Click 'Retry' to try connecting again.\n"
                            "Click 'Cancel' to exit the application.",
                            "Server Connection Failed",
                            MB_RETRYCANCEL | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND);

                        if (result == IDCANCEL) {
                            stopRequested_ = true;
                            isRunning_ = false;
                            PostQuitMessage(0);
                            return;
                        }
                        else {
                            connectionFailureCount_ = 0;
                            registrationRetries = 0;
                        }
                    }
                }
                else {
                    isRegistered_ = true; // Mark as successfully registered to the backend
                    connectionFailureCount_ = 0;
                    
                    if (yieldMonitor_) {
                        yieldMonitor_->UpdateMachineId(settings_.mcId);
                    }

                    UpdateConfigFile(settings_);

                    if (!webSocketConnected && webSocketClient_) {
                        webSocketClient_->Connect(settings_.mcId, [this](std::string cmd, std::string payload, std::string requestId) {
                            if (cmd == "UPLOAD_LOG") {
                                this->logService_->UploadRequestedFile(payload, requestId);
                                
                                std::string logFilePath = settings_.logFolderPath + "\\" + payload;
                                std::thread([this, logFilePath]() {
                                    std::ifstream file(logFilePath);
                                    if (!file.is_open()) return;
                                    
                                    std::stringstream buffer;
                                    buffer << file.rdbuf();
                                    std::string logContent = buffer.str();
                                    file.close();
                                    
                                    this->imageService_->PushThumbnailsForLog(logFilePath, logContent);
                                }).detach();
                            }
                            else if (cmd == "UPLOAD_IMAGE") {
                                this->imageService_->UploadInspectionImages(payload, requestId);
                            }
                            // Update commands (UpdateBundle, UpdateAgent, UpdateLAI, UpdateAgentSettings)
                            // are delivered exclusively via heartbeat polling — not via WebSocket.
                        });
                        webSocketConnected = true;
                    }
                }
            }
            else {
                for (int i = 0; i < AgentConstants::RETRY_DELAY_SECONDS && !stopRequested_; ++i) {
                    Sleep(1000);
                }
                registrationRetries = 0;
            }
        }

        if (registered) {
            bool heartbeatSuccess = heartbeatService_->SendHeartbeat(
                settings_.mcId, 
                processMonitor_->IsProcessRunning(settings_.exeName),
                httpClient_.get()
            );

            if (!heartbeatSuccess) {
                connectionFailureCount_++;

                if (connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {
                    registered = false;
                    registrationRetries = 0;

                    int result = MessageBoxA(NULL,
                        "Lost connection to server. Heartbeat failed multiple times.\n\n"
                        "Click 'Retry' to reconnect.\n"
                        "Click 'Cancel' to exit the application.",
                        "Server Connection Lost",
                        MB_RETRYCANCEL | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND);

                    if (result == IDCANCEL) {
                        stopRequested_ = true;
                        isRunning_ = false;
                        PostQuitMessage(0);
                        return;
                    }
                    else {
                        connectionFailureCount_ = 0;
                    }
                }
            }
            else {
                connectionFailureCount_ = 0;

                configService_->SyncConfigToServer();
                modelService_->SyncModelsToServer();
            }
        }

        for (int i = 0; i < AgentConstants::HEARTBEAT_INTERVAL_SECONDS && !stopRequested_; ++i) {
            Sleep(1000);
        }
    }
}