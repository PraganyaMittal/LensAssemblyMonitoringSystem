#pragma once

#include "YieldTypes.h"
#include <string>
#include <queue>
#include <thread>
#include <mutex>
#include <atomic>
#include <condition_variable>

namespace Yield {

    /**
     * YieldReporter — async HTTP upload queue.
     *
     * Accepts YieldResult items into a bounded, thread-safe queue.
     * A dedicated background thread drains the queue and POSTs
     * each result to the server.  Failed uploads are retried with
     * back-off.  The monitoring thread is never blocked by the network.
     */
    class YieldReporter {
    public:
        YieldReporter();
        ~YieldReporter();

        /**
         * Configure the reporter.
         * @param serverUrl  The backend server URL (e.g., L"http://192.168.1.100:5000")
         * @param machineId  The machine ID to include in each report payload.
         * @param queueLimit Maximum pending items before oldest items are dropped.
         */
        void Initialize(const std::wstring& serverUrl, int machineId, int queueLimit = 1000);

        /** Update the machine ID dynamically (e.g., after late registration). */
        void UpdateMachineId(int machineId);

        /** Start the background upload thread. */
        void Start();

        /** Stop the background thread.  Drains remaining items before returning. */
        void Stop();

        /**
         * Enqueue a yield result for upload.
         * Thread-safe, non-blocking.  Returns false if queue is full (item dropped).
         */
        bool Enqueue(const YieldResult& result);

    private:
        void UploadLoop();
        bool SendReport(const YieldResult& result);

        std::wstring serverUrl_;
        std::atomic<int> machineId_{0};
        int queueLimit_ = 1000;

        std::queue<YieldResult> queue_;
        std::mutex queueMutex_;
        std::condition_variable queueCv_;

        std::thread uploadThread_;
        std::atomic<bool> running_{false};

        static const int MAX_UPLOAD_RETRIES = 3;
    };

} // namespace Yield
