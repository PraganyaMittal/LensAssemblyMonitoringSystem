#ifndef SYNC_WORKER_H
#define SYNC_WORKER_H

/*
 * SyncWorker.h
 * Dedicated thread for syncing model and config state to the server.
 * 
 * Wakes up when:
 *   1. A dirty flag is set (model change, config change)
 *   2. A periodic timeout expires (safety net, e.g. every 5 minutes)
 * 
 * This thread owns the folder scanning + HTTP sync work,
 * keeping it off the heartbeat thread entirely.
 */

#include <atomic>
#include <mutex>
#include <condition_variable>
#include <chrono>

class ModelService;
class ConfigService;

class SyncWorker {
public:
    SyncWorker(ModelService* modelSvc, ConfigService* configSvc);
    ~SyncWorker();

    // Main loop — runs on the sync thread
    void Run(std::atomic<bool>& stopFlag);

    // Called by CommandExecutor or other threads after model changes
    void SignalModelsDirty();

    // Called by CommandExecutor or other threads after config changes
    void SignalConfigDirty();

private:
    ModelService* modelService_;
    ConfigService* configService_;

    std::atomic<bool> modelsDirty_{false};
    std::atomic<bool> configDirty_{false};

    std::mutex syncMutex_;
    std::condition_variable syncCv_;

    // Sync interval (safety net — even without dirty flag)
    static constexpr auto SYNC_TIMEOUT = std::chrono::minutes(5);

    SyncWorker(const SyncWorker&) = delete;
    SyncWorker& operator=(const SyncWorker&) = delete;
};

// === Inline Implementation ===
// Keep it header-only since it's small and avoids another .cpp compilation unit

inline SyncWorker::SyncWorker(ModelService* modelSvc, ConfigService* configSvc)
    : modelService_(modelSvc), configService_(configSvc) {
}

inline SyncWorker::~SyncWorker() {
}

inline void SyncWorker::Run(std::atomic<bool>& stopFlag) {
    while (!stopFlag.load()) {
        // Wait until:
        //   (a) A dirty flag is set, OR
        //   (b) Timeout expires (safety net sync), OR
        //   (c) Stop is requested
        {
            std::unique_lock<std::mutex> lock(syncMutex_);
            syncCv_.wait_for(lock, SYNC_TIMEOUT, [&] {
                return modelsDirty_.load() || configDirty_.load() || stopFlag.load();
            });
        }

        if (stopFlag.load()) break;

        // Perform sync work (this can take time — that's fine, heartbeat is on its own thread)
        if (modelsDirty_.load()) {
            if (modelService_) {
                modelService_->SyncModelsToServer();
            }
            modelsDirty_.store(false);
        }

        if (configDirty_.load()) {
            if (configService_) {
                configService_->SyncConfigToServer();
            }
            configDirty_.store(false);
        }
    }
}

inline void SyncWorker::SignalModelsDirty() {
    modelsDirty_.store(true);
    syncCv_.notify_one();
}

inline void SyncWorker::SignalConfigDirty() {
    configDirty_.store(true);
    syncCv_.notify_one();
}

#endif // SYNC_WORKER_H
