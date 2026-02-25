#include "../include/monitoring/YieldMonitor.h"
#include "../include/network/HttpClient.h"
#include "../include/utils/Logger.h"
#include "../include/utilities/NetworkUtils.h"
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
#include <chrono>

namespace fs = std::filesystem;

YieldMonitor::YieldMonitor() : running_(false), machineId_(0), dirHandle_(nullptr), overlapEvent_(nullptr) {
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
    
    // Signal the overlap event to unblock WaitForSingleObject
    if (overlapEvent_ != nullptr) {
        SetEvent((HANDLE)overlapEvent_);
    }

    // Close handle to break ReadDirectoryChangesW
    if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx((HANDLE)dirHandle_, nullptr);
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = nullptr;
    }

    if (overlapEvent_ != nullptr) {
        CloseHandle((HANDLE)overlapEvent_);
        overlapEvent_ = nullptr;
    }

    if (monitorThread_.joinable()) {
        monitorThread_.join();
    }
    FactoryAgent::Utils::Logger::Info("YieldMonitor stopped.");
}



void YieldMonitor::MonitorLoop() {
    // Open Directory Handle with FILE_FLAG_OVERLAPPED for async I/O
    dirHandle_ = CreateFileW(
        watchDirectory_.c_str(),
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED, // Overlapped for async + timeout
        NULL
    );

    if (dirHandle_ == INVALID_HANDLE_VALUE) {
        FactoryAgent::Utils::Logger::Error("Failed to open directory handle for monitoring: " + NetworkUtils::ConvertWStringToString(watchDirectory_));
        return;
    }

    // Create event for overlapped I/O
    overlapEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (overlapEvent_ == NULL) {
        FactoryAgent::Utils::Logger::Error("Failed to create overlap event for yield monitoring");
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = nullptr;
        return;
    }

    FactoryAgent::Utils::Logger::Info("Started Event-Driven Monitoring (Recursive, Stability=" + 
        std::to_string(AgentConstants::YIELD_FILE_STABILITY_SECONDS) + "s) on: " + 
        NetworkUtils::ConvertWStringToString(watchDirectory_));

    while (running_) {
        // Set up overlapped structure
        OVERLAPPED overlapped = {};
        overlapped.hEvent = (HANDLE)overlapEvent_;
        ResetEvent((HANDLE)overlapEvent_);

        // Issue async ReadDirectoryChangesW (non-blocking)
        BOOL issued = ReadDirectoryChangesW(
            (HANDLE)dirHandle_,
            changeBuffer_,
            sizeof(changeBuffer_),
            TRUE, // Watch Subtree (Recursive)
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE,
            NULL, // Not used with overlapped
            &overlapped,
            NULL
        );

        if (!issued && GetLastError() != ERROR_IO_PENDING) {
            if (running_) {
                FactoryAgent::Utils::Logger::Error("ReadDirectoryChangesW failed, retrying...");
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
            }
            continue;
        }

        // Wait with 1-second timeout (allows stability checks to run periodically)
        DWORD waitResult = WaitForSingleObject((HANDLE)overlapEvent_, 1000);

        if (!running_) break;

        if (waitResult == WAIT_OBJECT_0) {
            // File event(s) received
            DWORD bytesReturned = 0;
            BOOL gotResult = GetOverlappedResult((HANDLE)dirHandle_, &overlapped, &bytesReturned, FALSE);

            if (gotResult && bytesReturned > 0) {
                FILE_NOTIFY_INFORMATION* pNotify = (FILE_NOTIFY_INFORMATION*)changeBuffer_;
                
                while (true) {
                    std::wstring relFileName(pNotify->FileName, pNotify->FileNameLength / sizeof(WCHAR));
                    fs::path fullPath = fs::path(watchDirectory_) / relFileName;
                    
                    // Only care about XML files
                    if (fullPath.extension() == L".xml") {
                        std::wstring filePath = fullPath.wstring();

                        try {
                            std::this_thread::sleep_for(std::chrono::milliseconds(20));

                            if (fs::exists(fullPath)) {
                                auto ftime = fs::last_write_time(fullPath);
                                long long ticks = ftime.time_since_epoch().count();

                                bool needsProcessing = false;
                                auto it = processedFileTimestamps_.find(filePath);
                                
                                if (it == processedFileTimestamps_.end()) {
                                    needsProcessing = true; // New file
                                } else if (ticks > it->second) {
                                    needsProcessing = true; // File changed since last processing
                                }

                                if (needsProcessing) {
                                    // DON'T process yet — add to pending and start/reset stability timer
                                    pendingFiles_[filePath] = std::chrono::steady_clock::now();
                                    processedFileTimestamps_[filePath] = ticks;
                                    retryCount_.erase(filePath); // Reset retry count on new change
                                }
                            }
                        } catch (...) {
                            // File might be locked or deleted mid-event, ignore
                        }
                    }

                    if (pNotify->NextEntryOffset == 0) break;
                    pNotify = (FILE_NOTIFY_INFORMATION*)((LPBYTE)pNotify + pNotify->NextEntryOffset);
                }
            } else if (gotResult && bytesReturned == 0) {
                // Buffer overflow — too many changes at once, some events lost
                FactoryAgent::Utils::Logger::Warning("ReadDirectoryChangesW buffer overflow! Scanning directory for missed files...");
                ScanDirectoryForMissedFiles();
            }
        }
        // else: WAIT_TIMEOUT — no new file events, but we still check stable files below

        // Always check for files that have been stable long enough to process
        CheckStableFiles();
    }

    // Process any remaining pending files before shutdown
    if (!pendingFiles_.empty()) {
        FactoryAgent::Utils::Logger::Info("Processing " + std::to_string(pendingFiles_.size()) + " remaining pending files before shutdown...");
        for (auto& [filePath, _] : pendingFiles_) {
            TryReadFileShared(filePath);
        }
        pendingFiles_.clear();
        retryCount_.clear();
    }

    if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = nullptr;
    }
}

// --- TryReadFileShared ---
// Opens the file with shared read access (FILE_SHARE_READ | FILE_SHARE_WRITE).
// This allows reading even when the inspection machine still has the file open for writing.
// Returns true if successful, false if the file couldn't be read.
bool YieldMonitor::TryReadFileShared(const std::wstring& filePath) {
    // Use CreateFileW with shared access — allows read even when writer hasn't released
    HANDLE hFile = CreateFileW(
        filePath.c_str(),
        GENERIC_READ,                           // Read-only access
        FILE_SHARE_READ | FILE_SHARE_WRITE,     // Allow other processes to read AND write
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hFile == INVALID_HANDLE_VALUE) {
        return false; // File is exclusively locked or doesn't exist
    }

    // Read entire file content
    DWORD fileSize = GetFileSize(hFile, NULL);
    if (fileSize == 0 || fileSize == INVALID_FILE_SIZE) {
        CloseHandle(hFile);
        return false;
    }

    std::vector<char> buffer(fileSize + 1, 0);
    DWORD bytesRead = 0;
    BOOL readOk = ReadFile(hFile, buffer.data(), fileSize, &bytesRead, NULL);
    CloseHandle(hFile);

    if (!readOk || bytesRead == 0) {
        return false;
    }

    // We have the content — now process it the same way ProcessFile does
    std::string content(buffer.data(), bytesRead);
    int goodCount = 0, totalCount = 0;
    std::string trayId;

    if (!ParseYieldFromXml(content, goodCount, totalCount, trayId)) {
        return false;
    }

    double yield = 0.0;
    if (totalCount > 0) {
        yield = ((double)goodCount / totalCount) * 100.0;
    }

    // Extract filename stem for TrayId
    std::string pathStr;
    for (wchar_t wc : filePath) {
        pathStr += static_cast<char>(wc);
    }

    std::string filenameStem;
    size_t lastSlash = pathStr.find_last_of("\\/");
    std::string filename = (lastSlash != std::string::npos) ? pathStr.substr(lastSlash + 1) : pathStr;
    size_t lastDot = filename.find_last_of('.');
    filenameStem = (lastDot != std::string::npos) ? filename.substr(0, lastDot) : filename;

    // Extract Date from Path (YYYY/MM/DD or YYYY\MM\DD)
    std::string dateString;
    std::regex dateRegex(R"((\d{4})[\/\\](\d{2})[\/\\](\d{2}))");
    std::smatch dateMatch;
    if (std::regex_search(pathStr, dateMatch, dateRegex)) {
        dateString = dateMatch[1].str() + "-" + dateMatch[2].str() + "-" + dateMatch[3].str();
    }

    SendReport(goodCount, totalCount, filenameStem, yield, dateString);
    return true;
}

// --- CheckStableFiles ---
// Checks pending files. If stable for STABILITY_SECONDS, tries to read with shared access.
// If read fails, retries up to MAX_READ_RETRIES (once per second). After max retries, logs error and drops.
void YieldMonitor::CheckStableFiles() {
    auto now = std::chrono::steady_clock::now();
    auto it = pendingFiles_.begin();

    while (it != pendingFiles_.end()) {
        auto elapsedSeconds = std::chrono::duration_cast<std::chrono::seconds>(
            now - it->second).count();

        if (elapsedSeconds >= AgentConstants::YIELD_FILE_STABILITY_SECONDS) {
            std::string pathStr;
            for (wchar_t wc : it->first) {
                pathStr += static_cast<char>(wc);
            }

            if (TryReadFileShared(it->first)) {
                // Success!
                FactoryAgent::Utils::Logger::Info("File stable for " + 
                    std::to_string(AgentConstants::YIELD_FILE_STABILITY_SECONDS) + 
                    "s, processed tray: " + pathStr);
                retryCount_.erase(it->first);
                it = pendingFiles_.erase(it);
            } else {
                // Failed to read — increment retry counter
                int& retries = retryCount_[it->first];
                retries++;

                if (retries >= MAX_READ_RETRIES) {
                    // Give up after max retries
                    FactoryAgent::Utils::Logger::Error("Failed to read file after " + 
                        std::to_string(MAX_READ_RETRIES) + " retries, skipping: " + pathStr);
                    retryCount_.erase(it->first);
                    it = pendingFiles_.erase(it);
                } else {
                    // Keep in pending — will retry on next CheckStableFiles call (1 second later)
                    FactoryAgent::Utils::Logger::Warning("File locked (attempt " + 
                        std::to_string(retries) + "/" + std::to_string(MAX_READ_RETRIES) + 
                        "), will retry: " + pathStr);
                    ++it;
                }
            }
        } else {
            ++it;
        }
    }
}

// --- ScanDirectoryForMissedFiles ---
// Full directory scan fallback. Called after ReadDirectoryChangesW buffer overflow.
// Walks the entire watch directory, finds all XML files, and adds any new/changed ones to pending.
void YieldMonitor::ScanDirectoryForMissedFiles() {
    try {
        int found = 0;
        for (const auto& entry : fs::recursive_directory_iterator(watchDirectory_)) {
            if (!running_) break;
            if (!entry.is_regular_file()) continue;
            if (entry.path().extension() != L".xml") continue;

            std::wstring filePath = entry.path().wstring();
            auto ftime = fs::last_write_time(entry.path());
            long long ticks = ftime.time_since_epoch().count();

            bool needsProcessing = false;
            auto it = processedFileTimestamps_.find(filePath);

            if (it == processedFileTimestamps_.end()) {
                needsProcessing = true; // Never seen this file
            } else if (ticks > it->second) {
                needsProcessing = true; // File changed since we last processed it
            }

            if (needsProcessing) {
                pendingFiles_[filePath] = std::chrono::steady_clock::now();
                processedFileTimestamps_[filePath] = ticks;
                retryCount_.erase(filePath);
                found++;
            }
        }

        if (found > 0) {
            FactoryAgent::Utils::Logger::Info("Directory scan found " + std::to_string(found) + " new/changed files after buffer overflow");
        }
    } catch (const std::exception& e) {
        FactoryAgent::Utils::Logger::Error("Directory scan failed: " + std::string(e.what()));
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



