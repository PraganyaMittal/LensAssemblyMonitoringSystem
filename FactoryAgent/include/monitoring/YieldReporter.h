#pragma once

#include "YieldTypes.h"
#include <string>
#include <queue>
#include <thread>
#include <mutex>
#include <atomic>
#include <condition_variable>


    
    class YieldReporter {
    public:
        YieldReporter();
        ~YieldReporter();

        
        void Initialize(const std::wstring& serverUrl, int machineId, int queueLimit = 1000);

        
        void UpdateMachineId(int machineId);

        
        void Start();

        
        void Stop();

        
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

