#ifndef COMMAND_QUEUE_H
#define COMMAND_QUEUE_H



#include "json/json.hpp"
#include <queue>
#include <mutex>
#include <condition_variable>
#include <unordered_set>
#include <chrono>
#include <string>

using json = nlohmann::json;

class CommandQueue {
public:
    CommandQueue() = default;
    ~CommandQueue() = default;

    // Maximum number of seen command IDs to track before pruning.
    // Safe to clear because the server stops re-sending acknowledged commands.
    static constexpr size_t MAX_SEEN_IDS = 500;

    
    void Push(const json& command) {
        std::string id = ExtractCommandId(command);
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (!id.empty() && seenIds_.count(id)) {
                return;  
            }
            queue_.push(command);
            if (!id.empty()) {
                seenIds_.insert(id);
                if (seenIds_.size() > MAX_SEEN_IDS) seenIds_.clear();
            }
        }
        cv_.notify_one();
    }

    
    
    bool WaitAndPop(json& command, std::chrono::seconds timeout) {
        std::unique_lock<std::mutex> lock(mutex_);
        if (!cv_.wait_for(lock, timeout, [this] { return !queue_.empty(); })) {
            return false;
        }
        command = std::move(queue_.front());
        queue_.pop();
        return true;
    }

    
    void PushBatch(const json& commands) {
        if (!commands.is_array()) return;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            for (const auto& cmd : commands) {
                std::string id = ExtractCommandId(cmd);
                if (!id.empty() && seenIds_.count(id)) {
                    continue;  
                }
                queue_.push(cmd);
                if (!id.empty()) seenIds_.insert(id);
            }
            // Prune seen IDs if they grow too large
            if (seenIds_.size() > MAX_SEEN_IDS) seenIds_.clear();
        }
        cv_.notify_one();
    }

    
    
    void MarkCompleted(const std::string& commandId) {
        
        
    }

    
    void ClearHistory() {
        std::lock_guard<std::mutex> lock(mutex_);
        seenIds_.clear();
    }

    
    void Clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        while (!queue_.empty()) {
            queue_.pop();
        }
        seenIds_.clear();
    }

    
    void WakeAll() {
        cv_.notify_all();
    }

    size_t Size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size();
    }

private:
    std::queue<json> queue_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::unordered_set<std::string> seenIds_;  

    static std::string ExtractCommandId(const json& cmd) {
        if (cmd.contains("commandId")) {
            if (cmd["commandId"].is_string()) return cmd["commandId"].get<std::string>();
            if (cmd["commandId"].is_number()) return std::to_string(cmd["commandId"].get<int>());
        }
        if (cmd.contains("CommandId")) {
            if (cmd["CommandId"].is_string()) return cmd["CommandId"].get<std::string>();
            if (cmd["CommandId"].is_number()) return std::to_string(cmd["CommandId"].get<int>());
        }
        return "";
    }

    
    CommandQueue(const CommandQueue&) = delete;
    CommandQueue& operator=(const CommandQueue&) = delete;
};

#endif 
