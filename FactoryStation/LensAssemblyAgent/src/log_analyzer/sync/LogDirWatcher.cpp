#include "log_analyzer/sync/LogDirWatcher.h"
#include "core/Logger.h"
#include "network/NetworkUtils.h"
#include <chrono>
#include <filesystem>

namespace fs = std::filesystem;

LogDirWatcher::~LogDirWatcher() {
    Stop();
}

void LogDirWatcher::Initialize(const std::wstring& watchDirectory, std::function<void()> onSyncTriggered) {
    watchDirectory_ = watchDirectory;
    onSyncTriggered_ = std::move(onSyncTriggered);
}

void LogDirWatcher::Start() {
    if (monitorThread_.joinable()) return;
    if (watchDirectory_.empty()) {
        Logger::Warning("[LogDirWatcher] Cannot start: watch directory is empty.");
        return;
    }

    // Verify the directory exists before starting
    if (!fs::exists(watchDirectory_) || !fs::is_directory(watchDirectory_)) {
        Logger::Warning("[LogDirWatcher] Watch directory does not exist yet: " +
            NetworkUtils::ConvertWStringToString(watchDirectory_) +
            ". Will retry when directory appears.");
    }

    // 64KB buffer — the maximum safe size for ReadDirectoryChangesW on
    // network-mounted drives (NAS via SMB/CIFS). Larger buffers cause
    // silent failures on SMB shares. 64KB works on all drive types.
    changeBuffer_.resize(65536);

    monitorThread_ = std::jthread([this](std::stop_token stoken) {
        MonitorLoop(stoken);
    });

    Logger::Info("[LogDirWatcher] Started watching: " +
        NetworkUtils::ConvertWStringToString(watchDirectory_));
}

void LogDirWatcher::Stop() {
    // Request the thread to stop cooperatively via stop_token
    monitorThread_.request_stop();

    // Unblock the WaitForSingleObject call inside MonitorLoop
    if (overlapEvent_ != nullptr) {
        SetEvent(overlapEvent_);
    }

    // Cancel the pending ReadDirectoryChangesW I/O operation
    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CancelIoEx(dirHandle_, nullptr);
    }

    // Wait for thread exit before closing handles
    if (monitorThread_.joinable()) {
        monitorThread_.join();
    }

    // Release Win32 handles
    if (dirHandle_ != INVALID_HANDLE_VALUE) {
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
    }
    if (overlapEvent_ != nullptr) {
        CloseHandle(overlapEvent_);
        overlapEvent_ = nullptr;
    }

    Logger::Info("[LogDirWatcher] Stopped.");
}

void LogDirWatcher::MonitorLoop(std::stop_token stoken) {
    // Edge case: directory may not exist at agent startup (LAI hasn't launched yet).
    // Wait for it to appear, checking every 5 seconds.
    while (!stoken.stop_requested()) {
        if (fs::exists(watchDirectory_) && fs::is_directory(watchDirectory_)) {
            break;
        }
        Logger::Info("[LogDirWatcher] Waiting for directory to be created: " +
            NetworkUtils::ConvertWStringToString(watchDirectory_));

        // Sleep in 500ms increments so stop_token is checked frequently
        for (int i = 0; i < 10 && !stoken.stop_requested(); ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }
    }
    if (stoken.stop_requested()) return;

    // Open a handle to the directory for monitoring
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
        Logger::Error("[LogDirWatcher] Failed to open directory handle: " +
            NetworkUtils::ConvertWStringToString(watchDirectory_) +
            " (error=" + std::to_string(GetLastError()) + ")");
        return;
    }

    // Manual-reset event for overlapped I/O completion signaling
    overlapEvent_ = CreateEvent(NULL, TRUE, FALSE, NULL);
    if (overlapEvent_ == NULL) {
        Logger::Error("[LogDirWatcher] Failed to create overlap event (error=" +
            std::to_string(GetLastError()) + ")");
        CloseHandle(dirHandle_);
        dirHandle_ = INVALID_HANDLE_VALUE;
        return;
    }

    // Fire an initial sync so the server has the current state on startup
    if (onSyncTriggered_) {
        onSyncTriggered_();
    }

    while (!stoken.stop_requested()) {
        OVERLAPPED overlapped = {};
        overlapped.hEvent = overlapEvent_;
        ResetEvent(overlapEvent_);

        BOOL issued = ReadDirectoryChangesW(
            dirHandle_,
            changeBuffer_.data(),
            static_cast<DWORD>(changeBuffer_.size()),
            TRUE,  // Watch subtrees (Year/Month/Day hierarchy)
            // Only structural changes: file/folder creation, deletion, rename.
            // FILE_NOTIFY_CHANGE_LAST_WRITE is excluded because it fires on
            // every log line append (~hundreds/minute), but we only care about
            // new files appearing in the structure.
            FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME,
            NULL,
            &overlapped,
            NULL
        );

        if (!issued && GetLastError() != ERROR_IO_PENDING) {
            DWORD err = GetLastError();
            if (err == ERROR_ACCESS_DENIED || err == ERROR_INVALID_HANDLE) {
                // Directory may have been deleted or permissions revoked
                Logger::Error("[LogDirWatcher] Lost access to directory (error=" +
                    std::to_string(err) + "). Stopping monitor.");
                break;
            }
            // Transient error — retry after a short delay
            if (!stoken.stop_requested()) {
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
            }
            continue;
        }

        // Wait for the overlapped I/O to complete.
        // 1-second timeout allows periodic stop_token checks.
        while (!stoken.stop_requested()) {
            DWORD waitResult = WaitForSingleObject(overlapEvent_, 1000);
            if (stoken.stop_requested()) break;

            if (waitResult == WAIT_OBJECT_0) {
                DWORD bytesReturned = 0;
                BOOL gotResult = GetOverlappedResult(dirHandle_, &overlapped, &bytesReturned, FALSE);

                if (gotResult && bytesReturned > 0) {
                    // Structural change detected — fire sync immediately.
                    // No debounce needed: LAI creates ~1 file/hour.
                    if (onSyncTriggered_) {
                        onSyncTriggered_();
                    }
                } else if (gotResult && bytesReturned == 0) {
                    // Buffer overflow: too many changes arrived at once for the
                    // 64KB buffer to hold. Trigger a full sync to catch everything.
                    Logger::Warning("[LogDirWatcher] Buffer overflow — triggering full sync.");
                    if (onSyncTriggered_) {
                        onSyncTriggered_();
                    }
                }
                break;  // Re-issue ReadDirectoryChangesW for the next batch
            }
            // WAIT_TIMEOUT — loop back and check stop_token
        }
    }
}
