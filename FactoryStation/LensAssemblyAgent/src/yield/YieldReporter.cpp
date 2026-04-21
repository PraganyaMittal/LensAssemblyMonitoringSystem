#include "yield/YieldReporter.h"
#include "network/HttpClient.h"
#include "core/Logger.h"
#include <chrono>


    YieldReporter::YieldReporter() = default;

    YieldReporter::~YieldReporter()
    {
        Stop();
    }

    void YieldReporter::Initialize(const std::wstring& serverUrl, int machineId, int queueLimit)
    {
        httpClient_ = std::make_unique<HttpClient>(serverUrl);
        machineId_  = machineId;
        queueLimit_ = queueLimit;
    }

    void YieldReporter::UpdateMachineId(int machineId)
    {
        machineId_ = machineId;
    }

    void YieldReporter::Start()
    {
        if (running_) return;
        running_ = true;
        uploadThread_ = std::thread(&YieldReporter::UploadLoop, this);
        Logger::Info("YieldReporter started (queue limit=" + std::to_string(queueLimit_) + ")");
    }

    void YieldReporter::Stop()
    {
        if (!running_) return;
        running_ = false;
        queueCv_.notify_all();

        if (uploadThread_.joinable()) {
            uploadThread_.join();
        }

        
        std::lock_guard<std::mutex> lock(queueMutex_);
        size_t remaining = queue_.size();
        if (remaining > 0) {
            Logger::Info("YieldReporter draining " + std::to_string(remaining) + " remaining items...");
            while (!queue_.empty()) {
                auto item = queue_.front();
                queue_.pop();
                SendReport(item);
            }
        }

        Logger::Info("YieldReporter stopped.");
    }

    bool YieldReporter::Enqueue(const YieldResult& result)
    {
        std::lock_guard<std::mutex> lock(queueMutex_);

        if (static_cast<int>(queue_.size()) >= queueLimit_) {
            Logger::Warning("YieldReporter queue full (" + std::to_string(queueLimit_) +
                "), dropping oldest item for tray: " + result.trayId);
            queue_.pop(); 
        }

        queue_.push(result);
        queueCv_.notify_one();
        return true;
    }

    void YieldReporter::UploadLoop()
    {
        while (running_) {
            YieldResult item;
            {
                std::unique_lock<std::mutex> lock(queueMutex_);
                queueCv_.wait_for(lock, std::chrono::seconds(2), [this]() {
                    return !queue_.empty() || !running_;
                });

                if (!running_ && queue_.empty()) break;
                if (queue_.empty()) continue;

                item = queue_.front();
                queue_.pop();
            }

            
            bool success = false;
            for (int attempt = 1; attempt <= MAX_UPLOAD_RETRIES; ++attempt) {
                if (!running_) break;

                if (SendReport(item)) {
                    success = true;
                    break;
                }

                if (attempt < MAX_UPLOAD_RETRIES) {
                    int delayMs = 1000 * attempt; 
                    Logger::Warning("YieldReporter upload failed (attempt " +
                        std::to_string(attempt) + "/" + std::to_string(MAX_UPLOAD_RETRIES) +
                        "), retrying in " + std::to_string(delayMs) + "ms for tray: " + item.trayId);

                    
                    for (int ms = 0; ms < delayMs && running_; ms += 100) {
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                }
            }

            if (!success && running_) {
                Logger::Error("YieldReporter failed to upload after " +
                    std::to_string(MAX_UPLOAD_RETRIES) + " retries, dropping tray: " + item.trayId);
            }
        }
    }

    bool YieldReporter::SendReport(const YieldResult& result)
    {
        if (!httpClient_) return false;

        try {
            json payload;
            payload["machineId"]       = machineId_.load();
            payload["trayId"]          = result.trayId;
            payload["goodCount"]       = result.goodCount;
            payload["totalCount"]      = result.totalCount;
            payload["yieldPercentage"] = result.yieldPercentage;

            if (!result.dateString.empty()) {
                payload["date"] = result.dateString;
            }

            json response;
            if (httpClient_->Post(L"/api/Yield/report", payload, response)) {
                Logger::Info("Yield reported for Tray: " + result.trayId);
                return true;
            }

            return false;
        }
        catch (const std::exception& e) {
            Logger::Error("Exception sending yield report for tray: " + result.trayId + " - " + e.what());
            return false;
        }
        catch (...) {
            Logger::Error("Unknown exception sending yield report for tray: " + result.trayId);
            return false;
        }
    }

