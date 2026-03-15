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
#include "../include/services/CommandQueue.h"
#include "../include/services/SyncWorker.h"
#include "../include/services/ModelDeployer.h"
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
    ipcThread_ = NULL;
    updateThread_ = NULL;
    isRunning_ = false;
    isRegistered_ = false;
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
    
    
    pipeClient_.reset(new PipeClient());
    pipeClient_->SetShutdownCallback([this]() {
        
        FactoryAgent::Utils::Logger::Info("[IPC] Server requested shutdown. Initiating graceful exit for update.");
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
    stopFlag_.store(false);

    
    heartbeatThread_ = std::thread(&AgentCore::HeartbeatLoop, this);
    syncThread_ = std::thread([this]() { syncWorker_->Run(stopFlag_); });
    commandThread_ = std::thread(&AgentCore::CommandWorkerLoop, this);
    
    
    
    ipcThread_ = CreateThread(NULL, 0, IpcThreadProc, this, 0, NULL);

    updateThread_ = CreateThread(NULL, 0, UpdateThreadProc, this, 0, NULL);

    
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

    
    stopFlag_.store(true);

    
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



DWORD WINAPI AgentCore::IpcThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->IpcLoop();
    return 0;
}

void AgentCore::IpcLoop() {
    if (!pipeClient_) return;

    
    
    while (!stopFlag_.load()) {
        if (!pipeClient_->Connect(30, 2000)) {
            FactoryAgent::Utils::Logger::Warning(
                "[IPC] Could not connect to update service. Will retry in 10 seconds.");
            
            
            for (int i = 0; i < 10 && !stopFlag_.load(); ++i) {
                Sleep(1000);
            }
            continue;
        }

        
        
        pipeClient_->RunLoop(stopFlag_);

        if (stopFlag_.load()) break;

        
        FactoryAgent::Utils::Logger::Info(
            "[IPC] Connection lost. Will reconnect in 5 seconds.");
        for (int i = 0; i < 5 && !stopFlag_.load(); ++i) {
            Sleep(1000);
        }
    }
}



DWORD WINAPI AgentCore::UpdateThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->UpdateLoop();
    return 0;
}

void AgentCore::UpdateLoop() {
    while (!stopFlag_.load()) {
        
        for (int i = 0; i < 15 && !stopFlag_.load(); ++i) {
            Sleep(1000);
        }

        if (stopFlag_.load() || !isRegistered_ || connectionFailureCount_ >= AgentConstants::MAX_CONNECTION_FAILURES) {
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
                        
                        std::string msg = "Registration Failed:\n" + errorMessage + "\n\nThe application will now exit.";
                        MessageBoxA(NULL, msg.c_str(), "Registration Rejected", MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND);
                        
                        
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
                        int result = MessageBoxA(NULL,
                            "Cannot connect to server. The agent has failed to connect multiple times.\n\n"
                            "Click 'Retry' to try connecting again.\n"
                            "Click 'Cancel' to exit the application.",
                            "Server Connection Failed",
                            MB_RETRYCANCEL | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND);

                        if (result == IDCANCEL) {
                            stopFlag_.store(true);
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
                            else {
                                
                                
                                
                                try {
                                    json jCmd;
                                    jCmd["commandId"] = requestId.empty() ? std::to_string(GetTickCount()) : requestId;
                                    jCmd["commandType"] = cmd;
                                    jCmd["commandData"] = payload;
                                    
                                    if (this->commandQueue_) {
                                        this->commandQueue_->Push(jCmd);
                                    }
                                } catch (...) {
                                    
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
                for (int i = 0; i < AgentConstants::RETRY_DELAY_SECONDS && !stopFlag_.load(); ++i) {
                    Sleep(1000);
                }
                registrationRetries = 0;
            }
        }

        if (registered) {
            

            
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
                    registered = false;
                    registrationRetries = 0;

                    int result = MessageBoxA(NULL,
                        "Lost connection to server. Heartbeat failed multiple times.\n\n"
                        "Click 'Retry' to reconnect.\n"
                        "Click 'Cancel' to exit the application.",
                        "Server Connection Lost",
                        MB_RETRYCANCEL | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND);

                    if (result == IDCANCEL) {
                        stopFlag_.store(true);
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

                
                
                if (!commands.empty() && commandQueue_) {
                    commandQueue_->PushBatch(commands);
                }
            }
        }

        
        for (int i = 0; i < AgentConstants::HEARTBEAT_INTERVAL_SECONDS && !stopFlag_.load(); ++i) {
            Sleep(1000);
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