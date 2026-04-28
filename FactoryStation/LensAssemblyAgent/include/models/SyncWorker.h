#ifndef SYNC_WORKER_H
#define SYNC_WORKER_H



#include <atomic>
#include <mutex>
#include <condition_variable>
#include <chrono>

class ModelService;

class SyncWorker {
public:
    SyncWorker(ModelService* modelSvc);
    ~SyncWorker();

    
    void Run(std::atomic<bool>& stopFlag);

    
    void SignalModelsDirty();

    
    void WakeUp();

private:
    ModelService* modelService_;

    std::atomic<bool> modelsDirty_{false};

    std::mutex syncMutex_;
    std::condition_variable syncCv_;

    
    static constexpr auto SYNC_TIMEOUT = std::chrono::minutes(5);

    SyncWorker(const SyncWorker&) = delete;
    SyncWorker& operator=(const SyncWorker&) = delete;
};




inline SyncWorker::SyncWorker(ModelService* modelSvc)
    : modelService_(modelSvc) {
}

inline SyncWorker::~SyncWorker() {
}

inline void SyncWorker::Run(std::atomic<bool>& stopFlag) {
    while (!stopFlag.load()) {
        
        
        
        
        {
            std::unique_lock<std::mutex> lock(syncMutex_);
            syncCv_.wait_for(lock, SYNC_TIMEOUT, [&] {
                return modelsDirty_.load() || stopFlag.load();
            });
        }

        if (stopFlag.load()) break;

        
        if (modelsDirty_.load()) {
            if (modelService_) {
                modelService_->SyncModelsToServer();
            }
            modelsDirty_.store(false);
        }
    }
}

inline void SyncWorker::SignalModelsDirty() {
    modelsDirty_.store(true);
    syncCv_.notify_one();
}

inline void SyncWorker::WakeUp() {
    syncCv_.notify_all();
}

#endif 
