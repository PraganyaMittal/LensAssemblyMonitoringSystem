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
#include "../include/common/Constants.h"
#include "../../third_party/json/json.hpp"
#include <fstream>
#include <sstream>
#include <thread>
#include <chrono>

using json = nlohmann::json;

AgentCore::AgentCore() {
    // Unique pointers initialize to nullptr automatically
    workerThread_ = NULL;
    isRunning_ = false;
    stopRequested_ = false;
    connectionFailureCount_ = 0;
}

AgentCore::~AgentCore() {
    Stop();
    // Unique pointers automatically delete implementation
}

bool AgentCore::Initialize(const AgentSettings& settings) {
    settings_ = settings;

    httpClient_.reset(new HttpClient(settings.serverUrl));
    webSocketClient_.reset(new FactoryAgent::Network::WebSocketClient(settings.serverUrl));
    registrationService_.reset(new RegistrationService());
    heartbeatService_.reset(new HeartbeatService());
    configManager_.reset(new ConfigManager());
    processMonitor_.reset(new ProcessMonitor());
    configService_.reset(new ConfigService(&settings_, httpClient_.get(), configManager_.get()));
    logService_.reset(new LogService(&settings_, httpClient_.get()));
    modelService_.reset(new ModelService(&settings_, httpClient_.get(), configManager_.get()));
    imageService_.reset(new ImageService(&settings_, httpClient_.get()));
    commandExecutor_.reset(new CommandExecutor(httpClient_.get(), configService_.get(), modelService_.get()));

    return true;
}

void AgentCore::Start() {
    if (isRunning_) {
        return;
    }

    isRunning_ = true;
    stopRequested_ = false;
    workerThread_ = CreateThread(NULL, 0, WorkerThreadProc, this, 0, NULL);
}

void AgentCore::Stop() {
    if (!isRunning_) {
        return;
    }
    stopRequested_ = true;

    if (webSocketClient_) {
        webSocketClient_->Stop();
    }

    if (workerThread_) {
        WaitForSingleObject(workerThread_, 5000);
        CloseHandle(workerThread_);
        workerThread_ = NULL;
    }

    isRunning_ = false;
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
    bool webSocketConnected = false;  // Track WebSocket connection state
    int registrationRetries = 0;

    while (!stopRequested_) {
        if (!registered) {
            if (registrationRetries < AgentConstants::MAX_REGISTRATION_RETRIES) {
                registered = registrationService_->RegisterWithServer(&settings_, httpClient_.get());
                if (!registered) {
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
                    
                    // Connect WebSocket after registration to use correct mcId
                    if (!webSocketConnected && webSocketClient_) {
                        webSocketClient_->Connect(settings_.mcId, [this](std::string cmd, std::string payload, std::string requestId) {
                            if (cmd == "UPLOAD_LOG") {
                                this->logService_->UploadRequestedFile(payload, requestId);
                                
                                // Push thumbnails in background after log upload
                                std::string logFilePath = settings_.logFolderPath + "\\" + payload;
                                std::thread([this, logFilePath]() {
                                    // Read log file content
                                    std::ifstream file(logFilePath);
                                    if (!file.is_open()) return;
                                    
                                    std::stringstream buffer;
                                    buffer << file.rdbuf();
                                    std::string logContent = buffer.str();
                                    file.close();
                                    
                                    // Push thumbnails for this log
                                    this->imageService_->PushThumbnailsForLog(logFilePath, logContent);
                                }).detach();
                            }
                            else if (cmd == "UPLOAD_IMAGE") {
                                this->imageService_->UploadInspectionImages(payload, requestId);
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
                    
                    // IMMEDIATE SYNC after command execution
                    // Skip heartbeat delay - update database right away
                    configService_->SyncConfigToServer();
                    logService_->SyncLogsToServer();
                    modelService_->SyncModelsToServer();
                }
                else {
                    // Normal periodic sync (no commands)
                    configService_->SyncConfigToServer();
                    // logService_->SyncLogsToServer(); // REMOVED: Sync is now handled by rotation alignment logic
                    modelService_->SyncModelsToServer();
                }
            }
        }

        // ---- Rotation Alignment Sync Logic ----
        // 1. Calculate next rotation time
        static std::chrono::system_clock::time_point nextRotationSync{};
        static bool rotationInitialized = false;
        auto now = std::chrono::system_clock::now();

        if (!rotationInitialized) {
             // Initial calculation
             double hours = settings_.rotationIntervalHours;
             if (hours <= 0) hours = 24.0;
             long long periodSec = static_cast<long long>(hours * 3600.0);
             if (periodSec < 1) periodSec = 60; // minimum 1 min safety

             auto nowSec = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
             long long remainder = nowSec % periodSec;
             long long waitSec = periodSec - remainder;
             
             // Schedule next sync at exactly aligned time
             nextRotationSync = now + std::chrono::seconds(waitSec);
             rotationInitialized = true;
        }

        // 2. Check if we reached the time
        if (now >= nextRotationSync) {
            // Wait 2 seconds to ensure external logger has finished creating the file
            Sleep(2000);
            
            // Force Sync
             if (registered) {
                 logService_->SyncLogsToServer();
             }
             
             // Advance to next interval
             double hours = settings_.rotationIntervalHours;
             if (hours <= 0) hours = 24.0;
             long long periodSec = static_cast<long long>(hours * 3600.0);
             nextRotationSync = nextRotationSync + std::chrono::seconds(periodSec);
        }
        // ---------------------------------------

        for (int i = 0; i < AgentConstants::HEARTBEAT_INTERVAL_SECONDS && !stopRequested_; ++i) {
            // Check rotation sync during sleep to hit it precisely? 
            // For now, 1 second resolution is fine.
            Sleep(1000);
            
            // Optional: Break early if we hit the sync time? 
            // If precision is critical:
            if (std::chrono::system_clock::now() >= nextRotationSync) break;
        }
    }
}