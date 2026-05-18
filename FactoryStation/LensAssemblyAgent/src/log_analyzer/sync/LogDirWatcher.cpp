#include "log_analyzer/sync/LogDirWatcher.h"
#include "core/Logger.h"
#include "network/NetworkUtils.h"
#include "common/Constants.h"
#include <chrono>

LogDirWatcher::~LogDirWatcher() {
    Stop();
}

void LogDirWatcher::Initialize(const std::wstring& watchDirectory, std::function<void()> onSyncTriggered) {
    watchDirectory_ = watchDirectory;
    onSyncTriggered_ = onSyncTriggered;
}

void LogDirWatcher::Start() {
    if (monitorThread_.joinable()) return;  // Already running
    if (watchDirectory_.empty()) return;

    isDirty_.store(false);
    lastChangeTicks_.store(0);
    // The change buffer stores File System Notification records from Windows.
    // Why exactly 65536 (64KB)? 
    // If the folder being watched is ever placed on a Network Mapped Drive (NAS via SMB/CIFS),
    // the Windows networking protocol restricts this buffer to a maximum of 64KB. 
    // If you pass a larger buffer (e.g. 1MB), ReadDirectoryChangesW will silently fail
    // when watching network drives. 64KB is the safest maximum for all drive types.
    changeBuffer_.resize(65536);

    monitorThread_ = std::jthread([this](std::stop_token stoken) {
        MonitorLoop(stoken);
    });
    debounceThread_ = std::jthread([this](std::stop_token stoken) {
        DebounceLoop(stoken);
    });

    std::string dirStr = NetworkUtils::ConvertWStringToString(watchDirectory_);
    Logger::Info("LogDirWatcher started watching: " + dirStr);
}

void LogDirWatcher::Stop() {
    // Request both threads to stop. jthread::request_stop() is safe to call
    // even if the thread is not running (no-op).
    monitorThread_.request_stop();
    debounceThread_.request_stop();

    // Wake the debounce thread so it exits immediately
    debounceCv_.notify_all();

    // Cancel the blocking ReadDirectoryChangesW / WaitForSingleObject
    if (overlapEvent_ != nullptr) {
        SetEvent(overlapEvent_);
    }
    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx(dirHandle_, nullptr);
    }

    // jthread destructor auto-joins, but we join explicitly here
    // because we need to close handles AFTER threads exit.
    if (monitorThread_.joinable()) monitorThread_.join();
    if (debounceThread_.joinable()) debounceThread_.join();

    // Clean up Win32 handles
    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
    }
    if (overlapEvent_ != nullptr) {
        CloseHandle(overlapEvent_);
        overlapEvent_ = nullptr;
    }

    Logger::Info("LogDirWatcher stopped.");
}

void LogDirWatcher::MonitorLoop(std::stop_token stoken) {
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
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
        return;
    }

    while (!stoken.stop_requested()) {
        OVERLAPPED overlapped = {};
        overlapped.hEvent = overlapEvent_;
        ResetEvent(overlapEvent_);

        BOOL issued = ReadDirectoryChangesW(
            dirHandle_,
            changeBuffer_.data(),
            static_cast<DWORD>(changeBuffer_.size()),
            TRUE, 
            // Watch for file/directory creation, deletion, and rename ONLY.
            // FILE_NOTIFY_CHANGE_LAST_WRITE is intentionally EXCLUDED because it fires
            // on every content append to the active log file (hundreds of times/minute),
            // causing unnecessary tree-building work. We only care about STRUCTURE changes
            // (new files/folders appearing), not content modifications.
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME,
            NULL,
            &overlapped,
            NULL
        );

        if (!issued && GetLastError() != ERROR_IO_PENDING) {
            if (!stoken.stop_requested()) std::this_thread::sleep_for(std::chrono::milliseconds(500));
            continue;
        }
        
        while (!stoken.stop_requested()) {
            DWORD waitResult = WaitForSingleObject(overlapEvent_, 1000);
            if (stoken.stop_requested()) break;
            if (waitResult == WAIT_OBJECT_0) {
                DWORD bytesReturned = 0;
                BOOL gotResult = GetOverlappedResult(dirHandle_, &overlapped, &bytesReturned, FALSE);

                if (gotResult && bytesReturned > 0) {
                    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                    isDirty_.store(true);
                    debounceCv_.notify_one();  // Wake debounce thread immediately
                } else if (gotResult && bytesReturned == 0) {
                    Logger::Warning("LogDirWatcher buffer overflow! Triggering full sync.");
                    lastChangeTicks_.store(std::chrono::steady_clock::now().time_since_epoch().count());
                    isDirty_.store(true);
                    debounceCv_.notify_one();
                }
                break;
            }
        }
    }
}

void LogDirWatcher::DebounceLoop(std::stop_token stoken) {
    const auto DEBOUNCE_DURATION = std::chrono::seconds(5);

    while (!stoken.stop_requested()) {
        // Wait until either: (a) dirty flag is set, or (b) stop is requested.
        // This replaces the old sleep_for(500ms) busy-wait polling.
        {
            std::unique_lock lock(debounceMutex_);
            debounceCv_.wait(lock, [this, &stoken] {
                return isDirty_.load() || stoken.stop_requested();
            });
        }

        if (stoken.stop_requested()) break;

        // Dirty flag is set. Now wait for the debounce duration (5 seconds of silence).
        // If new changes come in during this time, lastChangeTicks_ gets updated,
        // and we need to wait again from the new timestamp.
        while (!stoken.stop_requested()) {
            auto nowNs = std::chrono::steady_clock::now().time_since_epoch().count();
            auto lastNs = lastChangeTicks_.load();
            auto elapsedNs = nowNs - lastNs;
            auto debounceNs = DEBOUNCE_DURATION.count() * 1000000000LL;

            if (elapsedNs >= debounceNs) {
                // 5 seconds of silence — fire the callback
                isDirty_.store(false);
                if (onSyncTriggered_) {
                    onSyncTriggered_();
                }
                break;
            }

            // Wait for the remaining debounce time (interruptible by stop)
            auto remainingMs = std::chrono::milliseconds(
                (debounceNs - elapsedNs) / 1000000 + 1
            );
            {
                std::unique_lock lock(debounceMutex_);
                debounceCv_.wait_for(lock, remainingMs, [&stoken] {
                    return stoken.stop_requested();
                });
            }
        }
    }
}
