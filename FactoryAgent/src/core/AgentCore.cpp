#include "core/AgentCore.h"
#include "network/WebSocketClient.h"
#include "core/RegistrationService.h"
#include "core/HeartbeatService.h"
#include "commands/CommandExecutor.h"
#include "core/ConfigService.h"
#include "logs/LogService.h"
#include "models/ModelService.h"
#include "logs/ImageService.h"
#include "network/PipeClient.h"
#include "commands/CommandQueue.h"
#include "models/SyncWorker.h"
#include "models/ModelDeployer.h"
#include "core/DiagnosticsService.h"
#include "network/HttpClient.h"
#include "core/ConfigManager.h"
#include "core/ProcessMonitor.h"
#include "yield/YieldMonitor.h"
#include "logs/LogDirWatcher.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include "utilities/ResourceGovernor.h"
#include "json/json.hpp"
#include <fstream>
#include <sstream>
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

AgentCore::AgentCore() : ipChangeHandle_(nullptr), isRunning_(false), isRegistered_(false), connectionFailureCount_(0) {
    stopEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (!stopEvent_) {
        Logger::Error("Failed to create stop event. Error: " + std::to_string(GetLastError()));
    }
}

AgentCore::~AgentCore() {
    Stop();
    if (stopEvent_) {
        CloseHandle(stopEvent_);
        stopEvent_ = NULL;
    }
}

bool AgentCore::Initialize(const AgentSettings& settings) {
    settings_ = settings;

    httpClient_.reset(new HttpClient(settings.serverUrl));
    webSocketClient_.reset(new WebSocketClient(settings.serverUrl));
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
    
    pipeClient_.reset(new PipeClient());
    pipeClient_->SetShutdownCallback([this]() {
        Logger::Info("[IPC] Server requested shutdown. Initiating graceful exit for update.");
        this->stopFlag_.store(true);

        HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
        if (hwnd) {
            PostMessage(hwnd, WM_CLOSE, 0, 0);
        }
    });

    commandQueue_.reset(new CommandQueue());
    syncWorker_.reset(new SyncWorker(modelService_.get()));
    modelDeployer_.reset(new ModelDeployer(&settings_, httpClient_.get()));

    commandExecutor_.reset(new CommandExecutor(httpClient_.get(), configService_.get(), modelService_.get(), pipeClient_.get()));
    commandExecutor_->SetSyncWorker(syncWorker_.get());
    commandExecutor_->SetModelDeployer(modelDeployer_.get());

    diagnosticsService_.reset(new DiagnosticsService());

    return true;
}

void AgentCore::ReloadSettings(const AgentSettings& settings) {
    std::unique_lock<std::shared_mutex> lock(settingsMutex_);
    settings_ = settings;
}

void AgentCore::Start() {
    if (isRunning_) {
        return;
    }

    isRunning_ = true;
    stopFlag_.store(false);
    ResetEvent(stopEvent_);

    if (heartbeatService_) {
        heartbeatService_->CacheVersionInfo();
    }

    heartbeatThread_ = std::thread(&AgentCore::HeartbeatLoop, this);
    syncThread_ = std::thread([this]() { syncWorker_->Run(stopFlag_); });
    commandThread_ = std::thread(&AgentCore::CommandWorkerLoop, this);
    
    ipcThread_ = std::thread(&AgentCore::IpcLoop, this);
    diagnosticsThread_ = std::thread(&AgentCore::DiagnosticsLoop, this);

    NotifyIpInterfaceChange(AF_INET, (PIPINTERFACE_CHANGE_CALLBACK)OnIpChange, this, FALSE, &ipChangeHandle_);

    if (yieldMonitor_) {
        yieldMonitor_->Start();
    }

    if (logService_) {
        logService_->Start();
    }

    if (logDirWatcher_) {
        logDirWatcher_->Initialize(NetworkUtils::ConvertStringToWString(settings_.logFolderPath), [this]() {
            if (this->logService_) {
                this->logService_->TriggerAsyncSync();
            }
        });
        logDirWatcher_->Start();
    }

    
    ResourceGovernor::Start(stopFlag_, stopEvent_);
}

void AgentCore::Stop() {
    if (!isRunning_) {
        return;
    }

    stopFlag_.store(true);
    SetEvent(stopEvent_);

    if (commandQueue_) {
        commandQueue_->WakeAll();
    }
    if (syncWorker_) {
        syncWorker_->WakeUp();
    }

    if (pipeClient_) {
        pipeClient_->Disconnect();
    }

    if (webSocketClient_) {
        webSocketClient_->Stop();
    }
    
    if (ipChangeHandle_) {
        CancelMibChangeNotify2(ipChangeHandle_);
        ipChangeHandle_ = NULL;
    }

    if (logService_) {
        logService_->Stop();
    }

    if (logDirWatcher_) {
        logDirWatcher_->Stop();
    }

    if (yieldMonitor_) {
        yieldMonitor_->Stop();
    }

    if (heartbeatThread_.joinable()) {
        heartbeatThread_.join();
    }
    if (syncThread_.joinable()) {
        syncThread_.join();
    }
    if (commandThread_.joinable()) {
        commandThread_.join();
    }

    if (ipcThread_.joinable()) {
        ipcThread_.join();
    }
    if (diagnosticsThread_.joinable()) {
        diagnosticsThread_.join();
    }


    if (ipReportThread_.joinable()) {
        ipReportThread_.join();
    }

    isRunning_ = false;
}

void CALLBACK AgentCore::OnIpChange(PVOID CallerContext, PMIB_IPINTERFACE_ROW Row, MIB_NOTIFICATION_TYPE NotificationType) {
    if (NotificationType != MibParameterNotification && NotificationType != MibAddInstance) {
        return;
    }

    AgentCore* core = static_cast<AgentCore*>(CallerContext);
    if (!core || !core->isRunning_) return;

    Sleep(2000);

    std::string newIp = NetworkUtils::DetectIPAddress();
    {
        std::unique_lock<std::shared_mutex> lock(core->settingsMutex_);
        if (!newIp.empty() && newIp != core->settings_.ipAddress) {
            core->settings_.ipAddress = newIp;
            UpdateConfigFile(core->settings_);
        } else {
            return;  
        }
    }
    core->ReportNewIp(newIp);
}

void AgentCore::ReportNewIp(const std::string& newIp) {
    if (!httpClient_ || settings_.mcId <= 0) return;

    int mcId = settings_.mcId;
    HttpClient* client = httpClient_.get();

    if (ipReportThread_.joinable()) {
        ipReportThread_.join();
    }

    ipReportThread_ = std::thread([client, mcId, newIp]() {
        try {
            json payload;
            payload["mcId"] = mcId;
            payload["currentIpAddress"] = newIp;

            json response;
            client->Post(AgentConstants::ENDPOINT_UPDATE_IP, payload, response);
        } catch (const std::exception& e) {
            Logger::Error("Exception in IP report thread: " + std::string(e.what()));
        } catch (...) {
            Logger::Error("Unknown exception in IP report thread");
        }
    });
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


DWORD WINAPI AgentCore::IpcThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->IpcLoop();
    return 0;
}

void AgentCore::IpcLoop() {
    if (!pipeClient_) return;

    
    while (!stopFlag_.load()) {
        if (!pipeClient_->Connect(30, 2000, &stopFlag_)) {
            Logger::Warning(
                "[IPC] Could not connect to update service. Will retry in 10 seconds.");
            
            for (int i = 0; i < 10 && !stopFlag_.load(); ++i) {
                Sleep(1000);
            }
            continue;
        }

        
        
        
        {
            std::string installDir = std::string(AgentConstants::DEFAULT_INSTALL_DIR);
            std::string markerPath = installDir + ".update_pending";
            std::ifstream markerFile(markerPath);
            if (markerFile.is_open()) {
                std::string payload((std::istreambuf_iterator<char>(markerFile)),
                                     std::istreambuf_iterator<char>());
                markerFile.close();

                if (!payload.empty()) {
                    Logger::Info(
                        "[IPC] Found staging marker. Re-sending NOTIFY_UPDATE: " + payload);
                    pipeClient_->NotifyUpdate(payload);
                }

                
                std::remove(markerPath.c_str());
            }
        }

        
        pipeClient_->RunLoop(stopFlag_);

        if (stopFlag_.load()) break;

        Logger::Info(
            "[IPC] Connection lost. Will reconnect in 5 seconds.");
        for (int i = 0; i < 5 && !stopFlag_.load(); ++i) {
            Sleep(1000);
        }
    }
}




void AgentCore::HeartbeatLoop() {
    bool registered = false;
    bool webSocketConnected = false;
    int registrationRetries = 0;

    while (!stopFlag_.load()) {
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
                        Logger::Error("Registration rejected by server: " + errorMessage);
                        
                        remove(AgentConstants::CONFIG_FILE_NAME);

                        HWND hwnd = FindWindowW(AgentConstants::WINDOW_CLASS_NAME, AgentConstants::WINDOW_TITLE);
                        if (hwnd) {
                            PostMessage(hwnd, WM_CLOSE, 0, 0);
                        }

                        stopFlag_.store(true);
                        isRunning_ = false;
                        return;
                    }

                    registrationRetries++;
                    connectionFailureCount_++;

                    if (connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {   
                        Logger::Error("Connection failed " + std::to_string(connectionFailureCount_) + " times. Will keep retrying...");
                        
                        connectionFailureCount_ = 0;
                        registrationRetries = 0;
                    }
                }
                else {
                    isRegistered_ = true;
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
                                try {
                                    std::ifstream file(logFilePath);
                                    if (file.is_open()) {
                                        std::stringstream buffer;
                                        buffer << file.rdbuf();
                                        std::string logContent = buffer.str();
                                        file.close();
                                        
                                        if (this->imageService_) {
                                            this->imageService_->PushThumbnailsForLog(logFilePath, logContent);
                                        }
                                    }
                                } catch (const std::exception& e) {
                                    Logger::Warning(std::string("[WebSocket] Failed to push thumbnails for log: ") + logFilePath + " - " + e.what());
                                } catch (...) {
                                    Logger::Warning("[WebSocket] Failed to push thumbnails for log: " + logFilePath);
                                }
                            }
                            else if (cmd == "UPLOAD_IMAGE") {
                                this->imageService_->UploadInspectionImages(payload, requestId);
                            }
                            else {
                                try {
                                    json jCmd;
                                    jCmd["commandId"] = requestId.empty() ? std::to_string(GetTickCount()) : requestId;
                                    jCmd["commandType"] = cmd;
                                    jCmd["commandData"] = payload;
                                    
                                    if (this->commandQueue_) {
                                        this->commandQueue_->Push(jCmd);
                                    }
                                } catch (const std::exception& e) {
                                    Logger::Error("Exception pushing WebSocket command: " + std::string(e.what()));
                                } catch (...) {
                                    Logger::Error("Unknown exception pushing WebSocket command");
                                }
                            }
                        });
                        webSocketConnected = true;
                    }

                    if (syncWorker_) {
                        syncWorker_->SignalModelsDirty();
                    }
                }
            }
            else {
                if (WaitForSingleObject(stopEvent_, AgentConstants::RETRY_DELAY_SECONDS * 1000) == WAIT_OBJECT_0) {
                    break;
                }
                registrationRetries = 0;
            }
        }

        if (registered) {
            
            ResourceGovernor::Ping();

            
            if (pipeClient_ && heartbeatService_) {
                heartbeatService_->SetIpcStatus(pipeClient_->IsConnected(), pipeClient_->IsConnected() ? 0 : -1);
            }

            json commands;
            bool heartbeatSuccess = heartbeatService_->SendHeartbeat(
                settings_.mcId, 
                processMonitor_->IsProcessRunning(settings_.exeName),
                settings_.configFilePath,
                httpClient_.get(), 
                &commands
            );

            if (!heartbeatSuccess) {
                connectionFailureCount_++;

                if (connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {
                    Logger::Error("Heartbeat failed " + std::to_string(connectionFailureCount_) + " times. Re-registering...");
                    registered = false;
                    registrationRetries = 0;
                    
                    connectionFailureCount_ = 0;
                }
            }
            else {
                connectionFailureCount_ = 0;

                if (!commands.empty() && commandQueue_) {
                    commandQueue_->PushBatch(commands);
                }
            }
        }

        if (WaitForSingleObject(stopEvent_, AgentConstants::HEARTBEAT_INTERVAL_SECONDS * 1000) == WAIT_OBJECT_0) {
            break;
        }
    }
}


void AgentCore::CommandWorkerLoop() {
    while (!stopFlag_.load()) {
        json command;

        if (commandQueue_->WaitAndPop(command, std::chrono::seconds(5))) {
            if (commandExecutor_) {
                commandExecutor_->ExecuteCommand(command);
            }
        }
    }
}


void AgentCore::DiagnosticsLoop() {
    while (!stopFlag_.load()) {
        if (WaitForSingleObject(stopEvent_, AgentConstants::DIAGNOSTICS_INTERVAL_SECONDS * 1000) == WAIT_OBJECT_0) {
            break;
        }

        if (stopFlag_.load() || !isRegistered_ || connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {
            continue;
        }

        if (diagnosticsService_ && httpClient_ && settings_.mcId > 0) {
            try {
                diagnosticsService_->SendDiagnostics(
                    settings_.mcId, settings_.configFilePath, httpClient_.get());
            }
            catch (const std::exception& e) {
                Logger::Error(std::string("[Diagnostics] Error: ") + e.what());
            }
        }
    }
}