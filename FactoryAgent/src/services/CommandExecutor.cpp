#include "../include/services/CommandExecutor.h"
#include "../include/services/ConfigService.h"
#include "../include/services/ModelService.h"
#include "../include/network/HttpClient.h"
#include "../include/common/Constants.h"
#include "../include/utilities/ZipUtils.h"
#include "../include/utilities/FileUtils.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>

#pragma comment(lib, "bcrypt.lib")

// Compute SHA-256 hash of a file using Windows BCrypt API
static std::string ComputeFileSHA256(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) return "";

    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    std::string result;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";

    DWORD hashObjSize = 0, dataSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashObject(hashObjSize);
    DWORD hashSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashValue(hashSize);

    if (BCryptCreateHash(hAlg, &hHash, hashObject.data(), hashObjSize, NULL, 0, 0) == 0) {
        char buffer[8192];
        while (file.read(buffer, sizeof(buffer)) || file.gcount() > 0) {
            BCryptHashData(hHash, (PUCHAR)buffer, (ULONG)file.gcount(), 0);
            if (file.eof()) break;
        }

        if (BCryptFinishHash(hHash, hashValue.data(), hashSize, 0) == 0) {
            std::ostringstream oss;
            for (DWORD i = 0; i < hashSize; i++) {
                oss << std::hex << std::setfill('0') << std::setw(2) << (int)hashValue[i];
            }
            result = oss.str();
        }
        BCryptDestroyHash(hHash);
    }

    BCryptCloseAlgorithmProvider(hAlg, 0);
    return result;
}

// Get directory of the running executable
static std::string GetExeDirectory() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string dir(path);
    size_t pos = dir.find_last_of("\\/");
    return (pos != std::string::npos) ? dir.substr(0, pos + 1) : dir;
}

CommandExecutor::CommandExecutor(HttpClient* client, ConfigService* configSvc, ModelService* modelSvc) {
    httpClient_ = client;
    configService_ = configSvc;
    modelService_ = modelSvc;
}

CommandExecutor::~CommandExecutor() {
}

void CommandExecutor::ProcessCommands(const json& commands) {
    if (!commands.is_array()) {
        return;
    }

    size_t count = commands.size();
    for (size_t i = 0; i < count; i++) {
        ExecuteCommand(commands[i]);
    }
}

bool CommandExecutor::ExecuteCommand(const json& command) {
    if (!command.contains("commandId") || !command.contains("commandType")) {
        return false;
    }

    int commandId = command["commandId"].get<int>();
    std::string commandType = command["commandType"].get<std::string>();

    CommandResult result;
    result.commandId = commandId;
    result.success = false;
    result.status = AgentConstants::STATUS_FAILED;

    if (commandType == AgentConstants::COMMAND_UPDATE_CONFIG) {
        if (command.contains("commandData")) {
            std::string configContent = command["commandData"].get<std::string>();
            if (configService_->ApplyConfigFromServer(configContent)) {
                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_CHANGE_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    if (modelService_->ChangeModel(modelName)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                        // Immediately re-sync so DB reflects the change in real-time
                        // (don't wait for next heartbeat cycle)
                        if (configService_) configService_->SyncConfigToServer();
                        if (modelService_) modelService_->SyncModelsToServer();
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_UPLOAD_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (modelService_->UploadModelToServer(data)) {
                    result.success = true;
                    result.status = AgentConstants::STATUS_COMPLETED;
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_DELETE_MODEL) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    if (modelService_->DeleteModel(modelName)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    else if (commandType == "UploadModelToLib") { // Using string literal as constant might not be defined yet
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());
                if (data.contains("ModelName") && data.contains("UploadUrl")) {
                    std::string modelName = data["ModelName"].get<std::string>();
                    std::string uploadUrl = data["UploadUrl"].get<std::string>();
                    if (modelService_->UploadModelToLibrary(modelName, uploadUrl)) {
                        result.success = true;
                        result.status = AgentConstants::STATUS_COMPLETED;
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("JSON parse error: ") + ex.what();
            }
        }
    }
    // =========================================================================
    // UpdateAgent — Download new agent build, verify hash, extract to updates/
    // =========================================================================
    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT) {
        if (command.contains("commandData")) {
            try {
                json data = json::parse(command["commandData"].get<std::string>());

                std::string downloadUrl = data.value("downloadUrl", "");
                std::string fileHash    = data.value("fileHash", "");
                std::string version     = data.value("version", "");

                if (downloadUrl.empty()) {
                    result.errorMessage = "Missing downloadUrl in commandData";
                }
                else {
                    std::cout << "[UpdateAgent] Starting update download v" << version << std::endl;

                    // Report InProgress immediately
                    result.status = AgentConstants::STATUS_IN_PROGRESS;
                    result.resultData = "Downloading update v" + version;
                    SendCommandResult(commandId, result);

                    // Paths
                    std::string exeDir = GetExeDirectory();
                    std::string tempDir = exeDir + AgentConstants::TEMP_FOLDER_NAME + "\\";
                    std::string updatesDir = exeDir + AgentConstants::UPDATES_FOLDER_NAME + "\\";
                    std::string zipFileName = "update_" + version + ".zip";
                    std::string tempZipPath = tempDir + zipFileName;

                    // Ensure temp directory exists
                    FileUtils::CreateFolder(tempDir);

                    // Step 1: Download the .zip
                    std::cout << "[UpdateAgent] Downloading from " << downloadUrl << std::endl;
                    if (!httpClient_->DownloadFile(downloadUrl, tempZipPath)) {
                        result.errorMessage = "Failed to download update package";
                        std::cerr << "[UpdateAgent] Download failed" << std::endl;
                    }
                    else if (!FileUtils::FileExists(tempZipPath)) {
                        result.errorMessage = "Downloaded file not found on disk";
                    }
                    else {
                        // Step 2: Verify SHA-256 hash
                        bool hashOk = true;
                        if (!fileHash.empty()) {
                            std::cout << "[UpdateAgent] Verifying SHA-256..." << std::endl;
                            std::string computedHash = ComputeFileSHA256(tempZipPath);

                            // Case-insensitive compare (server may send uppercase)
                            std::string hashLower = fileHash;
                            std::string computedLower = computedHash;
                            for (auto& c : hashLower)   c = (char)tolower(c);
                            for (auto& c : computedLower) c = (char)tolower(c);

                            if (computedLower != hashLower) {
                                result.errorMessage = "Hash mismatch! Expected: " + fileHash +
                                                      " Got: " + computedHash;
                                std::cerr << "[UpdateAgent] " << result.errorMessage << std::endl;
                                hashOk = false;
                                FileUtils::DeleteFile(tempZipPath);
                            }
                            else {
                                std::cout << "[UpdateAgent] Hash verified OK" << std::endl;
                            }
                        }

                        if (hashOk) {
                            // Step 3: Clean and recreate updates directory
                            if (FileUtils::FolderExists(updatesDir)) {
                                FileUtils::DeleteFolder(updatesDir);
                            }
                            FileUtils::CreateFolder(updatesDir);

                            // Step 4: Extract zip to updates/
                            std::cout << "[UpdateAgent] Extracting to " << updatesDir << std::endl;
                            if (!ZipUtils::ExtractZip(tempZipPath, updatesDir)) {
                                result.errorMessage = "Failed to extract update package";
                                std::cerr << "[UpdateAgent] Extraction failed" << std::endl;
                            }
                            else {
                                // Step 5: Cleanup temp zip
                                FileUtils::DeleteFile(tempZipPath);

                                result.success = true;
                                result.status = AgentConstants::STATUS_COMPLETED;
                                result.resultData = "Update v" + version + " downloaded and extracted to updates/";
                                std::cout << "[UpdateAgent] Update v" << version
                                          << " ready in " << updatesDir << std::endl;
                            }
                        }
                    }
                }
            } catch (const std::exception& ex) {
                result.errorMessage = std::string("UpdateAgent error: ") + ex.what();
                std::cerr << "[UpdateAgent] Exception: " << ex.what() << std::endl;
            }
        }
    }
    // RequestSync removed — models and config are auto-synced via heartbeat loop
    // NOTE: GetLogFileContent is now handled via WebSocket in AgentCore/LogService
    // It is no longer processed through the heartbeat polling mechanism

    else if (commandType == AgentConstants::COMMAND_UPDATE_AGENT_SETTINGS) {
        if (command.contains("commandData")) {
            try {
                // Since local config is now minimal (mcId, serverUrl), we don't need to write
                // LineNumber, mcNumber, etc. to agent_config.json.
                // The DB is already updated by the server BEFORE this command is sent.
                // We just need to restart the agent to fetch the new settings from the server.

                result.success = true;
                result.status = AgentConstants::STATUS_COMPLETED;
                result.resultData = "Agent settings updated. Restarting agent to apply changes...";
                
                // Send result back before dying
                SendCommandResult(commandId, result);
                
                // Sleep briefly to allow network flush, then restart
                Sleep(1000);
                
                // Re-launch the agent executable
                char exePath[MAX_PATH];
                GetModuleFileNameA(NULL, exePath, MAX_PATH);
                ShellExecuteA(NULL, "open", exePath, NULL, NULL, SW_SHOWDEFAULT);

                exit(0);
            }
            catch (const std::exception& ex) {
                result.success = false;
                result.errorMessage = std::string("Error accepting settings update: ") + ex.what();
            }
        }
    }
    else if (commandType == AgentConstants::COMMAND_RESET_AGENT) {
        try {
            // 1. Try to delete the config file
            bool deleted = (std::remove("agent_config.json") == 0);

            // 2. If delete failed, try to wipe the content so it can't be used again
            if (!deleted) {
                std::ofstream wiper("agent_config.json", std::ofstream::trunc);
                if (wiper.is_open()) {
                    wiper << "{}";
                    wiper.close();
                }
            }

            result.success = true;
            result.status = AgentConstants::STATUS_COMPLETED;
            result.resultData = "Agent reset command received. Shutting down.";

            // 3. Send result to server immediately
            SendCommandResult(commandId, result);

            // 4. FATAL EXIT: Sleep briefly to flush network, then KILL the process
            // This must be OUTSIDE any 'if' blocks to ensure we stop running.
            Sleep(1000);
            exit(0);
        }
        catch (const std::exception&) {
            // Even if an error occurs, we must die to stop the loop
            result.success = false;
            SendCommandResult(commandId, result);
            Sleep(1000);
            exit(0);
        }
        }


    SendCommandResult(commandId, result);
    return result.success;
}

void CommandExecutor::SendCommandResult(int commandId, const CommandResult& result) {
    json request;
    request["commandId"] = commandId;
    request["status"] = result.status;
    request["resultData"] = result.resultData;
    request["errorMessage"] = result.errorMessage;

    json response;
    httpClient_->Post(AgentConstants::ENDPOINT_COMMAND_RESULT, request, response);
}
