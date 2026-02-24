#include "../include/core/AgentCore.h"
#include "../include/network/WebSocketClient.h"
#include "../include/services/RegistrationService.h"
#include "../include/services/HeartbeatService.h"
#include "../include/services/CommandExecutor.h"
#include "../include/services/ConfigService.h"
#include "../include/services/LogService.h"
#include "../include/services/ModelService.h"
#include "../include/services/ImageService.h"
#include "../include/network/HttpClient.h"
#include "../include/monitoring/ConfigManager.h"
#include "../include/monitoring/ProcessMonitor.h"
#include "../include/monitoring/YieldMonitor.h"
#include "../include/common/Constants.h"
#include "../include/utilities/NetworkUtils.h"
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
    workerThread_ = NULL;
    isRunning_ = false;
    stopRequested_ = false;
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
    commandExecutor_.reset(new CommandExecutor(httpClient_.get(), configService_.get(), modelService_.get()));

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
    stopRequested_ = false;
    workerThread_ = CreateThread(NULL, 0, WorkerThreadProc, this, 0, NULL);
    
    // Register IP Change Notification
    NotifyIpInterfaceChange(AF_INET, (PIPINTERFACE_CHANGE_CALLBACK)OnIpChange, this, FALSE, &ipChangeHandle_);

    if (yieldMonitor_) {
        yieldMonitor_->Start();
    }
}

void AgentCore::Stop() {
    if (!isRunning_) {
        return;
    }
    stopRequested_ = true;

    if (webSocketClient_) {
        webSocketClient_->Stop();
    }
    
    // Unregister IP Change Notification
    if (ipChangeHandle_) {
        CancelMibChangeNotify2(ipChangeHandle_);
        ipChangeHandle_ = NULL;
    }

    if (yieldMonitor_) {
        yieldMonitor_->Stop();
    }

    if (workerThread_) {
        WaitForSingleObject(workerThread_, 5000);
        CloseHandle(workerThread_);
        workerThread_ = NULL;
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
    status.isConnected = (connectionFailureCount_ == 0);
    status.mcId = settings_.mcId;
    status.lineNumber = settings_.lineNumber;
    status.connectionFailures = connectionFailureCount_;
    return status;
}

DWORD WINAPI AgentCore::WorkerThreadProc(LPVOID param) {
    AgentCore* core = (AgentCore*)param;
    core->WorkerLoop();
    return 0;
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
                        // Hard rejection from server (e.g., config conflict or deleted MC)
                        MessageBoxA(NULL, errorMessage.c_str(), "Registration Rejected", MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND);
                        stopRequested_ = true;
                        isRunning_ = false;
                        PostQuitMessage(0);
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
                            else if (cmd == "UpdateAgentSettings") {
                                // Forward this real-time command directly to the Command Executor
                                try {
                                    json jCmd;
                                    
                                    // Normally the server sends commandId, but if missing via SignalR we can fake one
                                    jCmd["commandId"] = requestId.empty() ? std::to_string(GetTickCount()) : requestId; 
                                    jCmd["commandType"] = cmd;
                                    jCmd["commandData"] = payload;
                                    
                                    if (this->commandExecutor_) {
                                        this->commandExecutor_->ExecuteCommand(jCmd);
                                    }
                                } catch (...) {
                                    // Ignore parse errors on real-time channel
                                }
                            }
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
            json commands;
            bool heartbeatSuccess = heartbeatService_->SendHeartbeat(
                settings_.mcId, 
                processMonitor_->IsProcessRunning(settings_.exeName),
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

                if (!commands.empty()) {
                    commandExecutor_->ProcessCommands(commands);
                    
                    configService_->SyncConfigToServer();
                    logService_->SyncLogsToServer();
                    modelService_->SyncModelsToServer();
                }
                else {
                    configService_->SyncConfigToServer();
                    modelService_->SyncModelsToServer();
                }
            }
        }

        static std::chrono::system_clock::time_point nextRotationSync{};
        static bool rotationInitialized = false;
        auto now = std::chrono::system_clock::now();

        if (!rotationInitialized) {
             double hours = settings_.rotationIntervalHours;
             if (hours <= 0) hours = 24.0;
             long long periodSec = static_cast<long long>(hours * 3600.0);
             if (periodSec < 1) periodSec = 60;

             auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
             long long remainder = nowSec % periodSec;
             long long waitSec = periodSec - remainder;
             
             nextRotationSync = now + std::chrono::seconds(waitSec);
             rotationInitialized = true;
        }

        if (now >= nextRotationSync) {
            Sleep(2000);
            
             if (registered) {
                 logService_->SyncLogsToServer();
             }
             
             double hours = settings_.rotationIntervalHours;
             if (hours <= 0) hours = 24.0;
             long long periodSec = static_cast<long long>(hours * 3600.0);
             nextRotationSync = nextRotationSync + std::chrono::seconds(periodSec);
        }

        for (int i = 0; i < AgentConstants::HEARTBEAT_INTERVAL_SECONDS && !stopRequested_; ++i) {
            Sleep(1000);
            if (std::chrono::system_clock::now() >= nextRotationSync) break;
        }
    }
}