#include "../include/monitoring/YieldMonitor.h"
#include "../include/network/HttpClient.h"
#include "../include/utils/Logger.h"
#include "../include/common/Constants.h"
#include "../include/utilities/StringUtils.h"
#include <windows.h>
#include <filesystem>
#include <regex>
#include <fstream>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <ctime>

namespace fs = std::filesystem;

YieldMonitor::YieldMonitor() : running_(false), machineId_(0), dirHandle_(nullptr) {
}

YieldMonitor::~YieldMonitor() {
    Stop();
}

void YieldMonitor::UpdateMachineId(int machineId) {
    machineId_ = machineId;
}

void YieldMonitor::Initialize(const std::wstring& watchDirectory, int machineId, const std::wstring& lineNum, const std::wstring& mcNum, const std::wstring& serverUrl) {
    watchDirectory_ = watchDirectory;
    machineId_ = machineId;
    lineNumber_ = lineNum;
    mcNumber_ = mcNum;
    serverUrl_ = serverUrl;
}

void YieldMonitor::Start() {
    if (running_) return;
    running_ = true;
    monitorThread_ = std::thread(&YieldMonitor::MonitorLoop, this);
    std::string dirStr;
    for(wchar_t wc : watchDirectory_) {
        dirStr += static_cast<char>(wc);
    }
    FactoryAgent::Utils::Logger::Info("YieldMonitor started watching: " + dirStr);
}

void YieldMonitor::Stop() {
    running_ = false;
    
    // Close handle to break ReadDirectoryChangesW blocking call
    if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
        // CancelIoEx helps unblock the synchronous ReadDirectoryChangesW call immediately
        CancelIoEx((HANDLE)dirHandle_, nullptr);
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = nullptr;
    }

    if (monitorThread_.joinable()) {
        monitorThread_.join();
    }
    FactoryAgent::Utils::Logger::Info("YieldMonitor stopped.");
}



void YieldMonitor::MonitorLoop() {
    // Open Directory Handle
    dirHandle_ = CreateFileW(
        watchDirectory_.c_str(),
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS, // Required for directories
        NULL
    );

    if (dirHandle_ == INVALID_HANDLE_VALUE) {
        FactoryAgent::Utils::Logger::Error("Failed to open directory handle for monitoring: " + std::string(watchDirectory_.begin(), watchDirectory_.end()));
        return;
    }

    FactoryAgent::Utils::Logger::Info("Started Event-Driven Monitoring (Recursive) on: " + std::string(watchDirectory_.begin(), watchDirectory_.end()));

    while (running_) {
        DWORD bytesReturned = 0;
        
        // Blocking call - waits for OS notification
        // Recursive = TRUE (watch subfolders)
        // Filters: File Name (Creation/Renaming), Last Write (Content Change)
        BOOL success = ReadDirectoryChangesW(
            (HANDLE)dirHandle_,
            changeBuffer_,
            sizeof(changeBuffer_),
            TRUE, // Watch Subtree (Recursive)
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE,
            &bytesReturned,
            NULL,
            NULL
        );

        if (!running_) break; // Stop called during wait

        if (success && bytesReturned > 0) {
            FILE_NOTIFY_INFORMATION* pNotify = (FILE_NOTIFY_INFORMATION*)changeBuffer_;
            
            while (true) {
                // Extract Filename
                std::wstring relFileName(pNotify->FileName, pNotify->FileNameLength / sizeof(WCHAR));
                
                // Construct Full Path (WatchDirectory + RelativePath)
                // Note: ReadDirectoryChangesW returns relative path from watched root
                // We must handle paths carefully. std::filesystem::path helps.
                fs::path fullPath = fs::path(watchDirectory_) / relFileName;
                
                // Only care about XML files
                if (fullPath.extension() == L".xml") {
                    std::wstring filePath = fullPath.wstring();

                    // Debounce / Check if ready
                    // For "Last Write", we often get multiple events.
                    // We check if it truly changed or if it's new.
                    try {
                        // Wait a tiny bit for file lock to release (Windows behavior)
                        std::this_thread::sleep_for(std::chrono::milliseconds(20));

                        if (fs::exists(fullPath)) {
                            auto ftime = fs::last_write_time(fullPath);
                            long long ticks = ftime.time_since_epoch().count();

                            bool needsProcessing = false;
                            auto it = processedFileTimestamps_.find(filePath);
                            
                            if (it == processedFileTimestamps_.end()) {
                                needsProcessing = true; // New
                            } else {
                                if (ticks > it->second) {
                                    needsProcessing = true; // Changed (Content / Bin Count Updated)
                                }
                            }

                            if (needsProcessing) {
                                // Double check if file is readable (not locked exclusive)
                                std::ifstream check(filePath);
                                if (check.good()) {
                                    check.close();
                                    ProcessFile(filePath);
                                    processedFileTimestamps_[filePath] = ticks;
                                }
                            }
                        }
                    } catch (...) {
                         // File might be excluded/locked or deleted mid-event, ignore
                    }
                }

                if (pNotify->NextEntryOffset == 0) break;
                pNotify = (FILE_NOTIFY_INFORMATION*)((LPBYTE)pNotify + pNotify->NextEntryOffset);
            }
        }
        else {
            // ReadDirectoryChangesW failed or returned 0
            if (running_) {
                 // Could be buffer overflow or handle issue.
                 // Sleep briefly and retry loop.
                 std::this_thread::sleep_for(std::chrono::milliseconds(500));
            }
        }
    }

    if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = nullptr;
    }
}

void YieldMonitor::ProcessFile(const std::wstring& filePath) {
    try {
        std::ifstream file(filePath);
        if (!file.is_open()) return;

        std::stringstream buffer;
        buffer << file.rdbuf();
        std::string content = buffer.str();

        int goodCount = 0;
        int totalCount = 0;
        std::string trayId;

        if (ParseYieldFromXml(content, goodCount, totalCount, trayId)) {
            // Calculate percentage
            double yield = 0.0;
            if (totalCount > 0) {
                yield = ((double)goodCount / totalCount) * 100.0;
            }

            std::string pathStr;
            for(wchar_t wc : filePath) {
                pathStr += static_cast<char>(wc);
            }
            
            // Extract filename without extension for TrayId
            std::string filenameStem;
            size_t lastSlash = pathStr.find_last_of("\\/");
            std::string filename = (lastSlash != std::string::npos) ? pathStr.substr(lastSlash + 1) : pathStr;
            size_t lastDot = filename.find_last_of('.');
            if (lastDot != std::string::npos) {
                filenameStem = filename.substr(0, lastDot);
            } else {
                filenameStem = filename;
            }

            // Extract Date from Path (YYYY/MM/DD)
            std::string dateString;
            std::regex dateRegex(R"((\d{4})[\\/](\d{2})[\\/](\d{2}))");
            std::smatch dateMatch;
            if (std::regex_search(pathStr, dateMatch, dateRegex)) {
                 // dateMatch[1] = YYYY, [2] = MM, [3] = DD
                 // Construct Date String: YYYY-MM-DD
                 dateString = dateMatch[1].str() + "-" + dateMatch[2].str() + "-" + dateMatch[3].str();
            }

            // User Requirement: Use filename as Tray ID directly (no internal ID, no brackets)
            SendReport(goodCount, totalCount, filenameStem, yield, dateString);
        }
    }
    catch (const std::exception& e) {
        std::string err = e.what();
        FactoryAgent::Utils::Logger::Error("Failed to process XML: " + err);
    }
}

bool YieldMonitor::ParseYieldFromXml(const std::string& content, int& goodCount, int& totalCount, std::string& trayId) {
    try {
        // Regex for TrayId
        // <Kit TrayId="Lens_Tray1"
        std::regex trayRegex("TrayId=\"([^\"]+)\"");
        std::smatch trayMatch;
        if (std::regex_search(content, trayMatch, trayRegex)) {
            trayId = trayMatch[1].str();
        } else {
            trayId = "Unknown";
        }

        // Regex for Bins
        // <Bin BinCode="O" BinCount="3"
        // <Bin BinCode="X" BinCount="1"
        
        std::regex binRegex("<Bin\\s+BinCode=\"([OX])\"\\s+BinCount=\"(\\d+)\"");
        auto words_begin = std::sregex_iterator(content.begin(), content.end(), binRegex);
        auto words_end = std::sregex_iterator();

        int oCount = 0;
        int xCount = 0;

        for (std::sregex_iterator i = words_begin; i != words_end; ++i) {
            std::smatch match = *i;
            std::string code = match[1].str();
            int count = std::stoi(match[2].str());

            if (code == "O") {
                oCount = count;
            } else if (code == "X") {
                xCount = count;
            }
        }
        
        goodCount = oCount;
        totalCount = oCount + xCount;

        // Ensure we actually found something
        if (totalCount == 0 && goodCount == 0) return false;

        return true;
    }
    catch (...) {
        return false;
    }
}

void YieldMonitor::SendReport(int goodCount, int totalCount, const std::string& trayId, double yieldPercentage, const std::string& dateString) {
    if (serverUrl_.empty()) return;

    try {
        HttpClient client(serverUrl_);
        json payload;
        payload["machineId"] = machineId_;
        payload["trayId"] = trayId;
        payload["goodCount"] = goodCount;
        payload["totalCount"] = totalCount;
        payload["yieldPercentage"] = yieldPercentage;
        
        if (!dateString.empty()) {
            payload["date"] = dateString;
        }
        
        // Add timestamp if needed by backend, though backend usually stamps it. 
        // Adding client-side timestamp as ISO string or ticks might be good.
        // Assuming Backend handles it for now.

        json response;
        if (client.Post(L"/api/Yield/report", payload, response)) {
             FactoryAgent::Utils::Logger::Info("Yield reported for Tray: " + trayId);
        } else {
            FactoryAgent::Utils::Logger::Error("Failed to report yield for Tray: " + trayId);
        }
    } catch (...) {
        FactoryAgent::Utils::Logger::Error("Exception sending yield report");
    }
}



