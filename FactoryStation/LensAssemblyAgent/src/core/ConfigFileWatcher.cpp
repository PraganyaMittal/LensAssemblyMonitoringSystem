#include "core/ConfigFileWatcher.h"
#include "core/Logger.h"
#include "core/ConfigManager.h"
#include "utilities/FileUtils.h"
#include "network/NetworkUtils.h"
#include <chrono>

ConfigFileWatcher::ConfigFileWatcher() : running_(false), isDirty_(false), lastChangeTicks_(0), dirHandle_(INVALID_HANDLE_VALUE), overlapEvent_(nullptr) {
    changeBuffer_.resize(16384);
}

ConfigFileWatcher::~ConfigFileWatcher() {
    Stop();
}

void ConfigFileWatcher::Initialize(const std::string& configFilePath, std::function<void(const std::string&)> onModelChanged) {
    configFilePath_ = configFilePath;
    onModelChanged_ = onModelChanged;

    std::string pathObj = configFilePath;
    size_t lastSlash = pathObj.find_last_of("\\/");
    std::string dirStr = (lastSlash != std::string::npos) ? pathObj.substr(0, lastSlash) : ".";
    std::string fileStr = (lastSlash != std::string::npos) ? pathObj.substr(lastSlash + 1) : pathObj;

    watchDirectory_ = NetworkUtils::ConvertStringToWString(dirStr);
    targetFileName_ = NetworkUtils::ConvertStringToWString(fileStr);
}

void ConfigFileWatcher::Start() {
    if (running_) return;
    if (watchDirectory_.empty() || targetFileName_.empty()) return;

    running_.store(true);
    isDirty_.store(true); 
    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());

    monitorThread_ = std::thread(&ConfigFileWatcher::MonitorLoop, this);
    debounceThread_ = std::thread(&ConfigFileWatcher::DebounceLoop, this);

    Logger::Info("ConfigFileWatcher started watching: " + configFilePath_);
}

void ConfigFileWatcher::Stop() {
    running_.store(false);

    if (overlapEvent_ != nullptr) {
        SetEvent(overlapEvent_);
    }

    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx(dirHandle_, nullptr);
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
    }

    if (overlapEvent_ != nullptr) {
        CloseHandle(overlapEvent_);
        overlapEvent_ = nullptr;
    }

    if (monitorThread_.joinable()) monitorThread_.join();
    if (debounceThread_.joinable()) debounceThread_.join();

    Logger::Info("ConfigFileWatcher stopped.");
}

void ConfigFileWatcher::MonitorLoop() {
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
        Logger::Error("ConfigFileWatcher: Failed to open directory handle.");
        return;
    }

    overlapEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (overlapEvent_ == NULL) {
        Logger::Error("ConfigFileWatcher: Failed to create overlap event.");
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
        return;
    }

    while (running_.load()) {
        OVERLAPPED overlapped = {};
        overlapped.hEvent = overlapEvent_;
        ResetEvent(overlapEvent_);

        BOOL issued = ReadDirectoryChangesW(
            dirHandle_,
            changeBuffer_.data(),
            static_cast<DWORD>(changeBuffer_.size()),
            FALSE, 
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_SIZE,
            NULL,
            &overlapped,
            NULL
        );

        if (!issued && GetLastError() != ERROR_IO_PENDING) {
            if (running_.load()) std::this_thread::sleep_for(std::chrono::milliseconds(500));
            continue;
        }

        while (running_.load()) {
            DWORD waitResult = WaitForSingleObject(overlapEvent_, 500);
            
            if (!running_.load()) break;

            if (waitResult == WAIT_OBJECT_0) {
                DWORD bytesReturned = 0;
                BOOL gotResult = GetOverlappedResult(dirHandle_, &overlapped, &bytesReturned, FALSE);

                if (gotResult && bytesReturned > 0) {
                    bool targetFileModified = false;
                    FILE_NOTIFY_INFORMATION* pNotify = reinterpret_cast<FILE_NOTIFY_INFORMATION*>(changeBuffer_.data());
                    
                    while (true) {
                        std::wstring changedFile(pNotify->FileName, pNotify->FileNameLength / sizeof(WCHAR));
                        if (_wcsicmp(changedFile.c_str(), targetFileName_.c_str()) == 0) {
                            targetFileModified = true;
                            break;
                        }

                        if (pNotify->NextEntryOffset == 0) break;
                        pNotify = reinterpret_cast<FILE_NOTIFY_INFORMATION*>(reinterpret_cast<uint8_t*>(pNotify) + pNotify->NextEntryOffset);
                    }

                    if (targetFileModified) {
                        lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                        isDirty_.store(true);
                    }
                } else if (!gotResult) {
                    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                    isDirty_.store(true);
                }
                
                break;
            }
        }
    }
}

void ConfigFileWatcher::DebounceLoop() {
    const long long DEBOUNCE_NS = 200LL * 1000000LL; 
    
    while (running_.load()) {
        if (isDirty_.load()) {
            auto nowNs = std::chrono::steady_clock::now().time_since_epoch().count();
            
            if (nowNs - lastChangeTicks_.load() >= DEBOUNCE_NS) {
                isDirty_.store(false);
                ProcessFileChange();
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}

void ConfigFileWatcher::ProcessFileChange() {
    if (configFilePath_.empty()) return;

    std::string configContent;
    bool success = false;
    
    for (int attempts = 0; attempts < 5 && running_.load(); ++attempts) {
        if (FileUtils::ReadFileContent(configFilePath_, configContent)) {
            success = true;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    if (success && onModelChanged_) {
        ConfigManager tempCfg;
        std::string newModelName = tempCfg.GetCurrentModel(configContent);
        if (!newModelName.empty()) {
            onModelChanged_(newModelName);
        }
    } else if (!success) {
        Logger::Error("ConfigFileWatcher: Failed to read config file after retries.");
    }
}
