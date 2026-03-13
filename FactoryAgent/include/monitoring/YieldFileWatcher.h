#pragma once

#include "YieldTypes.h"
#include <string>
#include <map>
#include <thread>
#include <atomic>
#include <functional>
#include <chrono>
#include <cstdint>

namespace Yield {

    /**
     * YieldFileWatcher — event-driven file system monitor.
     *
     * Watches a directory (recursively) for new/modified .xml files.
     * Uses Windows Overlapped I/O (ReadDirectoryChangesW) for
     * efficient, non-polling detection.
     *
     * A file is only "delivered" to the callback once it has been
     * stable (unmodified) for the configured stability period AND
     * can be opened with shared-read access.
     */
    class YieldFileWatcher {
    public:
        /** Callback type: invoked with (filePath, fileContent) on successful read. */
        using FileReadyCallback = std::function<void(const std::wstring& filePath, const std::string& content)>;

        YieldFileWatcher();
        ~YieldFileWatcher();

        /**
         * Configure the watcher.
         * @param watchDirectory    Root directory to monitor recursively.
         * @param stabilitySeconds  Seconds a file must be unchanged before reading.
         * @param maxReadRetries    Max attempts to open a locked file.
         * @param onFileReady       Callback invoked when a file is stable and readable.
         */
        void Initialize(const std::wstring& watchDirectory,
                        int stabilitySeconds,
                        int maxReadRetries,
                        FileReadyCallback onFileReady);

        /** Start the monitoring thread. */
        void Start();

        /** Stop monitoring and join the thread. */
        void Stop();

    private:
        void MonitorLoop();
        void CheckStableFiles();
        bool TryReadFileShared(const std::wstring& filePath);
        void ScanDirectoryForMissedFiles();

        // Configuration
        std::wstring watchDirectory_;
        int stabilitySeconds_ = 15;
        int maxReadRetries_   = 5;
        FileReadyCallback onFileReady_;

        // Thread control
        std::atomic<bool> running_{false};
        std::thread monitorThread_;

        // File tracking
        std::map<std::wstring, long long> processedFileTimestamps_;
        std::map<std::wstring, std::chrono::steady_clock::time_point> pendingFiles_;
        std::map<std::wstring, int> retryCount_;

        // Overlapped I/O handles
        void* dirHandle_    = nullptr;
        void* overlapEvent_ = nullptr;
        uint8_t changeBuffer_[1024 * 128]{}; // 128KB for ~1300 file events
    };

} // namespace Yield
