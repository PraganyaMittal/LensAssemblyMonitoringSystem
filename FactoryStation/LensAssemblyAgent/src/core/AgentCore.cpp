#include "core/AgentCore.h"
#include "network/WebSocketClient.h"
#include "core/RegistrationService.h"
#include "core/HeartbeatService.h"
#include "commands/CommandDispatcher.h"
#include "commands/handlers/ConfigCommandHandler.h"
#include "commands/handlers/ModelCommandHandler.h"
#include "commands/handlers/DeployCommandHandler.h"
#include "commands/handlers/LifecycleCommandHandler.h"
#include "core/ConfigService.h"
#include "log_analyzer/sync/LogStructureSyncService.h"
#include "log_analyzer/upload/LogFileUploadService.h"
#include "models/ModelService.h"
#include "log_analyzer/upload/ImageUploadService.h"
#include "commands/CommandQueue.h"
#include "models/SyncWorker.h"
#include "models/ModelDeployer.h"
#include "core/DiagnosticsService.h"
#include "network/RestClient.h"
#include "PathResolver.h"
#include "core/ConfigManager.h"
#include "core/ProcessMonitor.h"
#include "core/ConfigFileWatcher.h"
#include "log_analyzer/yield/YieldMonitor.h"
#include "log_analyzer/sync/LogDirWatcher.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include "utilities/ResourceGovernor.h"
#include <nlohmann/json.hpp>
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

    httpClient_.reset(new RestClient(settings.serverUrl));
    webSocketClient_.reset(new WebSocketClient(settings.serverUrl));
    registrationService_.reset(new RegistrationService());
    heartbeatService_.reset(new HeartbeatService());
    configManager_.reset(new ConfigManager());
    processMonitor_.reset(new ProcessMonitor());
    configFileWatcher_.reset(new ConfigFileWatcher());
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
    logStructureSyncService_.reset(new LogStructureSyncService(&settings_, httpClient_.get()));
    logFileUploadService_.reset(new LogFileUploadService(&settings_, httpClient_.get()));
    modelService_.reset(new ModelService(&settings_, httpClient_.get(), configManager_.get()));
    imageUploadService_.reset(new ImageUploadService(&settings_, httpClient_.get()));
    
    
    

    commandQueue_.reset(new CommandQueue());
    uploadQueue_.reset(new CommandQueue());
    syncWorker_.reset(new SyncWorker(modelService_.get()));
    modelDeployer_.reset(new ModelDeployer(&settings_, httpClient_.get()));

    commandDispatcher_.reset(new CommandDispatcher(httpClient_.get(), configService_.get(), modelService_.get()));
    commandDispatcher_->SetSyncWorker(syncWorker_.get());
    commandDispatcher_->SetModelDeployer(modelDeployer_.get());

    
    commandDispatcher_->RegisterHandler(std::make_unique<ConfigCommandHandler>());
    commandDispatcher_->RegisterHandler(std::make_unique<ModelCommandHandler>());
    commandDispatcher_->RegisterHandler(std::make_unique<DeployCommandHandler>());
    commandDispatcher_->RegisterHandler(std::make_unique<LifecycleCommandHandler>());

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

    
    isRegistered_ = false;
    connectionFailureCount_ = 0;

    if (heartbeatService_) {
        heartbeatService_->CacheVersionInfo();
    }

    heartbeatThread_ = std::thread(&AgentCore::HeartbeatLoop, this);
    syncThread_ = std::thread([this]() { syncWorker_->Run(stopFlag_); });
    commandThread_ = std::thread(&AgentCore::CommandWorkerLoop, this);
    uploadThread_ = std::thread(&AgentCore::UploadWorkerLoop, this);

    diagnosticsThread_ = std::thread(&AgentCore::DiagnosticsLoop, this);

    NotifyIpInterfaceChange(AF_INET, (PIPINTERFACE_CHANGE_CALLBACK)OnIpChange, this, FALSE, &ipChangeHandle_);

    if (configFileWatcher_ && !settings_.configFilePath.empty()) {
        configFileWatcher_->Initialize(settings_.configFilePath, [this](const std::string& newModel) {
            if (this->httpClient_ && this->settings_.mcId > 0) {
                json payload;
                payload["mcId"] = this->settings_.mcId;
                payload["modelName"] = newModel;
                
                json response;
                
                if (this->httpClient_->Post(AgentConstants::ENDPOINT_UPDATE_MODEL, payload, response)) {
                    Logger::Info("Pushed new current model name to server: " + newModel);
                } else {
                    Logger::Error("Failed to push new current model name to server");
                }
            }
        });
        configFileWatcher_->Start();
    }

    if (yieldMonitor_) {
        yieldMonitor_->Start();
    }

    if (logStructureSyncService_) {
        logStructureSyncService_->Start();
    }

    if (logDirWatcher_) {
        logDirWatcher_->Initialize(NetworkUtils::ConvertStringToWString(settings_.logFolderPath), [this]() {
            if (this->logStructureSyncService_) {
                this->logStructureSyncService_->RequestStructureSync();
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
    if (uploadQueue_) {
        uploadQueue_->WakeAll();
    }
    if (syncWorker_) {
        syncWorker_->WakeUp();
    }



    if (webSocketClient_) {
        webSocketClient_->Stop();
    }
    
    if (ipChangeHandle_) {
        CancelMibChangeNotify2(ipChangeHandle_);
        ipChangeHandle_ = NULL;
    }

    if (configFileWatcher_) {
        configFileWatcher_->Stop();
    }

    if (logStructureSyncService_) {
        logStructureSyncService_->Stop();
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
    if (uploadThread_.joinable()) {
        uploadThread_.join();
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

    
    std::string newIp;
    int retries = 0;
    do {
        Sleep(2000);
        newIp = NetworkUtils::DetectIPAddress();
        retries++;
    } while ((newIp == "0.0.0.0" || newIp == "127.0.0.1" || newIp.empty()) && retries < 5);

    
    
    if (newIp == "0.0.0.0" || newIp == "127.0.0.1" || newIp.empty()) {
        return;
    }

    {
        std::unique_lock<std::shared_mutex> lock(core->settingsMutex_);
        if (newIp != core->settings_.ipAddress) {
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
    RestClient* client = httpClient_.get();

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
                            if (cmd == "UPLOAD_LOG" || cmd == "UPLOAD_IMAGE") {
                                json jCmd;
                                jCmd["commandType"] = cmd;
                                jCmd["commandData"] = payload;
                                jCmd["requestId"] = requestId;
                                if (this->uploadQueue_) {
                                    this->uploadQueue_->Push(jCmd);
                                }
                            }
                            else {
                                try {
                                    json jCmd;
                                    jCmd["commandId"] = requestId.empty() ? std::to_string(GetTickCount64()) : requestId;
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
            CheckUpdateResult();



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


void AgentCore::CheckUpdateResult() {
    if (!httpClient_ || settings_.mcId <= 0) return;

    std::string baseDir = PathResolver::ResolveBaseDirA();

    std::string cmdIdPath = baseDir + ".update_command_id";
    std::string resultPath = baseDir + ".update_result";

    std::ifstream cmdFile(cmdIdPath);
    if (!cmdFile.is_open()) return;

    std::string commandIdStr;
    std::getline(cmdFile, commandIdStr);
    cmdFile.close();

    int commandId = 0;
    try {
        commandId = std::stoi(commandIdStr);
    } catch (...) {
        remove(cmdIdPath.c_str());
        remove(resultPath.c_str());
        return;
    }

    std::ifstream resultFile(resultPath);
    if (!resultFile.is_open()) return;

    std::string resultContent;
    std::getline(resultFile, resultContent);
    resultFile.close();

    int exitCode = -1;
    std::string reason = "Unknown result";
    size_t pipePos = resultContent.find('|');
    if (pipePos != std::string::npos) {
        try {
            exitCode = std::stoi(resultContent.substr(0, pipePos));
            reason = resultContent.substr(pipePos + 1);
        } catch (...) {}
    } else {
        try {
            exitCode = std::stoi(resultContent);
        } catch (...) {}
    }

    json request;
    request["commandId"] = commandId;
    if (exitCode == 0) {
        request["status"] = AgentConstants::STATUS_COMPLETED;
        request["resultData"] = "Update installed successfully. (" + reason + ")";
        request["errorMessage"] = "";
    } else {
        request["status"] = AgentConstants::STATUS_FAILED;
        request["resultData"] = "";
        request["errorMessage"] = "Update failed (exit code " + std::to_string(exitCode) + "): " + reason;
    }

    try {
        json response;
        httpClient_->Post(AgentConstants::ENDPOINT_COMMAND_RESULT, request, response);
        Logger::Info("[Deploy] Successfully reported update result for command " + std::to_string(commandId));
        remove(cmdIdPath.c_str());
        remove(resultPath.c_str());
    } catch (const std::exception& e) {
        Logger::Error("[Deploy] Failed to report update result: " + std::string(e.what()));
    }
}

void AgentCore::CommandWorkerLoop() {
    while (!stopFlag_.load()) {
        json command;

        if (commandQueue_->WaitAndPop(command, std::chrono::seconds(5))) {
            if (commandDispatcher_) {
                commandDispatcher_->ExecuteCommand(command);
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

void AgentCore::UploadWorkerLoop() {
    while (!stopFlag_.load()) {
        json task;
        if (uploadQueue_->WaitAndPop(task, std::chrono::seconds(5))) {
            std::string cmd = task.value("commandType", "");
            std::string payload = task.value("commandData", "");
            std::string requestId = task.value("requestId", "");

            try {
                if (cmd == "UPLOAD_LOG") {
                    logFileUploadService_->UploadRequestedFile(payload, requestId);

                    // PushThumbnailsForLog needs unfiltered content (NGImage entries),
                    // so we read the full file here. This is safe because we're on
                    // the dedicated upload thread, not the WebSocket thread.
                    if (imageUploadService_) {
                        std::string logFilePath = settings_.logFolderPath + "\\" + payload;
                        try {
                            std::ifstream file(logFilePath);
                            if (file.is_open()) {
                                std::stringstream buffer;
                                buffer << file.rdbuf();
                                imageUploadService_->PushThumbnailsForLog(logFilePath, buffer.str());
                            }
                        } catch (const std::exception& e) {
                            Logger::Warning(std::string("[UploadWorker] Failed to push thumbnails: ") + e.what());
                        } catch (...) {
                            Logger::Warning("[UploadWorker] Failed to push thumbnails for: " + payload);
                        }
                    }
                }
                else if (cmd == "UPLOAD_IMAGE") {
                    imageUploadService_->UploadInspectionImages(payload, requestId);
                }
            } catch (const std::exception& e) {
                Logger::Error("[UploadWorker] Exception processing " + cmd + ": " + std::string(e.what()));
            } catch (...) {
                Logger::Error("[UploadWorker] Unknown exception processing " + cmd);
            }
        }
    }
}