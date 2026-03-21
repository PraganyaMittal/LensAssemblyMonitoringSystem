#include "monitoring/LogDirWatcher.h"
#include "Utils/Logger.h"
#include "utilities/NetworkUtils.h"
#include "common/Constants.h"
#include <chrono>

LogDirWatcher::LogDirWatcher() : running_(false), isDirty_(false), lastChangeTicks_(0), dirHandle_(INVALID_HANDLE_VALUE), overlapEvent_(nullptr) {
    changeBuffer_.resize(65536);
}

LogDirWatcher::~LogDirWatcher() {
    Stop();
}

void LogDirWatcher::Initialize(const std::wstring& watchDirectory, std::function<void()> onSyncTriggered) {
    watchDirectory_ = watchDirectory;
    onSyncTriggered_ = onSyncTriggered;
}

void LogDirWatcher::Start() {
    if (running_) return;
    if (watchDirectory_.empty()) return;

    running_.store(true);
    isDirty_.store(false);
    lastChangeTicks_.store(0);

    monitorThread_ = std::thread(&LogDirWatcher::MonitorLoop, this);
    debounceThread_ = std::thread(&LogDirWatcher::DebounceLoop, this);

    std::string dirStr = NetworkUtils::ConvertWStringToString(watchDirectory_);
    Logger::Info("LogDirWatcher started watching: " + dirStr);
}

void LogDirWatcher::Stop() {
    running_.store(false);

    if (overlapEvent_ != nullptr) {
        SetEvent((HANDLE)overlapEvent_);
    }

    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx((HANDLE)dirHandle_, nullptr);
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
    }

    if (overlapEvent_ != nullptr) {
        CloseHandle((HANDLE)overlapEvent_);
        overlapEvent_ = nullptr;
    }

    if (monitorThread_.joinable()) monitorThread_.join();
    if (debounceThread_.joinable()) debounceThread_.join();

    Logger::Info("LogDirWatcher stopped.");
}

void LogDirWatcher::MonitorLoop() {
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
        Logger::Error("Failed to open log directory handle for monitoring.");
        return;
    }

    overlapEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (overlapEvent_ == NULL) {
        Logger::Error("Failed to create overlap event for log monitoring.");
        CloseHandle((HANDLE)dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
        return;
    }

    while (running_.load()) {
        OVERLAPPED overlapped = {};
        overlapped.hEvent = (HANDLE)overlapEvent_;
        ResetEvent((HANDLE)overlapEvent_);

        BOOL issued = ReadDirectoryChangesW(
            (HANDLE)dirHandle_,
            changeBuffer_.data(),
            static_cast<DWORD>(changeBuffer_.size()),
            TRUE, 
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE,
            NULL,
            &overlapped,
            NULL
        );

        if (!issued && GetLastError() != ERROR_IO_PENDING) {
            if (running_.load()) std::this_thread::sleep_for(std::chrono::milliseconds(500));
            continue;
        }

        
        while (running_.load()) {
            DWORD waitResult = WaitForSingleObject((HANDLE)overlapEvent_, 1000);
            
            if (!running_.load()) break;

            if (waitResult == WAIT_OBJECT_0) {
                DWORD bytesReturned = 0;
                BOOL gotResult = GetOverlappedResult((HANDLE)dirHandle_, &overlapped, &bytesReturned, FALSE);

                if (gotResult && bytesReturned > 0) {
                    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                    isDirty_.store(true);
                } else if (gotResult && bytesReturned == 0) {
                    Logger::Warning("LogDirWatcher buffer overflow! Triggering full sync.");
                    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                    isDirty_.store(true);
                }
                
                
                break;
            }
            
        }
    }
}

void LogDirWatcher::DebounceLoop() {
    
    const long long DEBOUNCE_NS = 5LL * 1000LL * 1000000LL; 
    
    while (running_.load()) {
        if (isDirty_.load()) {
            auto nowNs = std::chrono::steady_clock::now().time_since_epoch().count();
            
            if (nowNs - lastChangeTicks_.load() >= DEBOUNCE_NS) {
                
                isDirty_.store(false);
                
                if (onSyncTriggered_) {
                    onSyncTriggered_();
                }
            }
        }
        
        
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
