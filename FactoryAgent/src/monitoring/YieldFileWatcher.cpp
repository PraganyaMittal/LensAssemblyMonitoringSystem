#include "../include/monitoring/YieldFileWatcher.h"
#include "../include/utils/Logger.h"
#include "../include/utilities/NetworkUtils.h"
#include <windows.h>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;

namespace Yield {

    YieldFileWatcher::YieldFileWatcher() = default;

    YieldFileWatcher::~YieldFileWatcher()
    {
        Stop();
    }

    void YieldFileWatcher::Initialize(const std::wstring& watchDirectory,
                                      int stabilitySeconds,
                                      int maxReadRetries,
                                      FileReadyCallback onFileReady)
    {
        watchDirectory_   = watchDirectory;
        stabilitySeconds_ = stabilitySeconds;
        maxReadRetries_   = maxReadRetries;
        onFileReady_      = onFileReady;
    }

    void YieldFileWatcher::Start()
    {
        if (running_) return;
        running_ = true;
        monitorThread_ = std::thread(&YieldFileWatcher::MonitorLoop, this);

        std::string dirStr = NetworkUtils::ConvertWStringToString(watchDirectory_);
        FactoryAgent::Utils::Logger::Info("YieldFileWatcher started (stability=" +
            std::to_string(stabilitySeconds_) + "s) watching: " + dirStr);
    }

    void YieldFileWatcher::Stop()
    {
        running_ = false;

        
        if (overlapEvent_ != nullptr) {
            SetEvent(static_cast<HANDLE>(overlapEvent_));
        }

        
        if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
            CancelIoEx(static_cast<HANDLE>(dirHandle_), nullptr);
            CloseHandle(static_cast<HANDLE>(dirHandle_));
            dirHandle_ = nullptr;
        }

        if (overlapEvent_ != nullptr) {
            CloseHandle(static_cast<HANDLE>(overlapEvent_));
            overlapEvent_ = nullptr;
        }

        if (monitorThread_.joinable()) {
            monitorThread_.join();
        }

        
        if (!pendingFiles_.empty()) {
            FactoryAgent::Utils::Logger::Info("YieldFileWatcher processing " +
                std::to_string(pendingFiles_.size()) + " remaining pending files before shutdown...");
            for (auto& [filePath, _] : pendingFiles_) {
                TryReadFileShared(filePath);
            }
            pendingFiles_.clear();
            retryCount_.clear();
        }

        FactoryAgent::Utils::Logger::Info("YieldFileWatcher stopped.");
    }

    
    
    
    void YieldFileWatcher::MonitorLoop()
    {
        dirHandle_ = CreateFileW(
            watchDirectory_.c_str(),
            FILE_LIST_DIRECTORY,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
            NULL
        );

        if (dirHandle_ == INVALID_HANDLE_VALUE) {
            FactoryAgent::Utils::Logger::Error("YieldFileWatcher: Failed to open directory: " +
                NetworkUtils::ConvertWStringToString(watchDirectory_));
            return;
        }

        overlapEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
        if (overlapEvent_ == NULL) {
            FactoryAgent::Utils::Logger::Error("YieldFileWatcher: Failed to create overlap event.");
            CloseHandle(static_cast<HANDLE>(dirHandle_));
            dirHandle_ = nullptr;
            return;
        }

        while (running_) {
            
            OVERLAPPED overlapped = {};
            overlapped.hEvent = static_cast<HANDLE>(overlapEvent_);
            ResetEvent(static_cast<HANDLE>(overlapEvent_));

            
            BOOL issued = ReadDirectoryChangesW(
                static_cast<HANDLE>(dirHandle_),
                changeBuffer_,
                sizeof(changeBuffer_),
                TRUE, 
                FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE,
                NULL,
                &overlapped,
                NULL
            );

            if (!issued && GetLastError() != ERROR_IO_PENDING) {
                if (running_) {
                    FactoryAgent::Utils::Logger::Error("YieldFileWatcher: ReadDirectoryChangesW failed, retrying...");
                    std::this_thread::sleep_for(std::chrono::milliseconds(500));
                }
                continue;
            }

            
            DWORD waitResult = WaitForSingleObject(static_cast<HANDLE>(overlapEvent_), 1000);
            if (!running_) break;

            if (waitResult == WAIT_OBJECT_0) {
                DWORD bytesReturned = 0;
                BOOL gotResult = GetOverlappedResult(
                    static_cast<HANDLE>(dirHandle_), &overlapped, &bytesReturned, FALSE);

                if (gotResult && bytesReturned > 0) {
                    
                    FILE_NOTIFY_INFORMATION* pNotify = reinterpret_cast<FILE_NOTIFY_INFORMATION*>(changeBuffer_);

                    while (true) {
                        std::wstring relFileName(pNotify->FileName, pNotify->FileNameLength / sizeof(WCHAR));
                        fs::path fullPath = fs::path(watchDirectory_) / relFileName;

                        
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
                                        needsProcessing = true; 
                                    } else if (ticks > it->second) {
                                        needsProcessing = true; 
                                    }

                                    if (needsProcessing) {
                                        pendingFiles_[filePath] = std::chrono::steady_clock::now();
                                        processedFileTimestamps_[filePath] = ticks;
                                        retryCount_.erase(filePath);
                                    }
                                }
                            } catch (...) {
                                
                            }
                        }

                        if (pNotify->NextEntryOffset == 0) break;
                        pNotify = reinterpret_cast<FILE_NOTIFY_INFORMATION*>(
                            reinterpret_cast<LPBYTE>(pNotify) + pNotify->NextEntryOffset);
                    }
                } else if (gotResult && bytesReturned == 0) {
                    
                    FactoryAgent::Utils::Logger::Warning(
                        "YieldFileWatcher: Buffer overflow! Scanning directory for missed files...");
                    ScanDirectoryForMissedFiles();
                }
            }
            

            CheckStableFiles();
        }

        
        if (dirHandle_ != nullptr && dirHandle_ != INVALID_HANDLE_VALUE) {
            CloseHandle(static_cast<HANDLE>(dirHandle_));
            dirHandle_ = nullptr;
        }
    }

    
    
    
    void YieldFileWatcher::CheckStableFiles()
    {
        auto now = std::chrono::steady_clock::now();
        auto it  = pendingFiles_.begin();

        while (it != pendingFiles_.end()) {
            auto elapsedSeconds = std::chrono::duration_cast<std::chrono::seconds>(
                now - it->second).count();

            if (elapsedSeconds >= stabilitySeconds_) {
                std::string pathStr = NetworkUtils::ConvertWStringToString(it->first);

                if (TryReadFileShared(it->first)) {
                    FactoryAgent::Utils::Logger::Info("YieldFileWatcher: Stable for " +
                        std::to_string(stabilitySeconds_) + "s, processed: " + pathStr);
                    retryCount_.erase(it->first);
                    it = pendingFiles_.erase(it);
                } else {
                    int& retries = retryCount_[it->first];
                    retries++;

                    if (retries >= maxReadRetries_) {
                        FactoryAgent::Utils::Logger::Error("YieldFileWatcher: Failed after " +
                            std::to_string(maxReadRetries_) + " retries, skipping: " + pathStr);
                        retryCount_.erase(it->first);
                        it = pendingFiles_.erase(it);
                    } else {
                        FactoryAgent::Utils::Logger::Warning("YieldFileWatcher: File locked (attempt " +
                            std::to_string(retries) + "/" + std::to_string(maxReadRetries_) +
                            "), will retry: " + pathStr);
                        ++it;
                    }
                }
            } else {
                ++it;
            }
        }
    }

    
    
    
    bool YieldFileWatcher::TryReadFileShared(const std::wstring& filePath)
    {
        HANDLE hFile = CreateFileW(
            filePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            NULL
        );

        if (hFile == INVALID_HANDLE_VALUE) {
            return false;
        }

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

        std::string content(buffer.data(), bytesRead);

        
        if (onFileReady_) {
            onFileReady_(filePath, content);
        }

        return true;
    }

    
    
    
    void YieldFileWatcher::ScanDirectoryForMissedFiles()
    {
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
                    needsProcessing = true;
                } else if (ticks > it->second) {
                    needsProcessing = true;
                }

                if (needsProcessing) {
                    pendingFiles_[filePath] = std::chrono::steady_clock::now();
                    processedFileTimestamps_[filePath] = ticks;
                    retryCount_.erase(filePath);
                    found++;
                }
            }

            if (found > 0) {
                FactoryAgent::Utils::Logger::Info("YieldFileWatcher: Directory scan found " +
                    std::to_string(found) + " new/changed files after buffer overflow.");
            }
        } catch (const std::exception& e) {
            FactoryAgent::Utils::Logger::Error("YieldFileWatcher: Directory scan failed: " + std::string(e.what()));
        }
    }

} 
