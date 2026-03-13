#ifndef COMMAND_QUEUE_H
#define COMMAND_QUEUE_H

/*
 * CommandQueue.h
 * Thread-safe command queue for the Command Worker thread.
 * Commands arrive from:
 *   1. SignalR/WebSocket (instant push)
 *   2. Heartbeat response (pending commands fallback)
 * The Command Worker thread pulls from this queue.
 *
 * Deduplication: Tracks recently seen command IDs to prevent
 * duplicate execution if the same command arrives via both SignalR and heartbeat.
 */

#include "../../third_party/json/json.hpp"
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

    // Push a command if not already seen (dedup by commandId)
    void Push(const json& command) {
        std::string id = ExtractCommandId(command);
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (!id.empty() && seenIds_.count(id)) {
                return;  // Already in queue or recently processed — skip
            }
            queue_.push(command);
            if (!id.empty()) seenIds_.insert(id);
        }
        cv_.notify_one();
    }

    // Block until a command is available or timeout expires
    // Returns true if a command was popped, false on timeout
    bool WaitAndPop(json& command, std::chrono::seconds timeout) {
        std::unique_lock<std::mutex> lock(mutex_);
        if (!cv_.wait_for(lock, timeout, [this] { return !queue_.empty(); })) {
            return false;
        }
        command = std::move(queue_.front());
        queue_.pop();
        return true;
    }

    // Push multiple commands at once (from heartbeat response), with dedup
    void PushBatch(const json& commands) {
        if (!commands.is_array()) return;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            for (const auto& cmd : commands) {
                std::string id = ExtractCommandId(cmd);
                if (!id.empty() && seenIds_.count(id)) {
                    continue;  // Skip duplicate
                }
                queue_.push(cmd);
                if (!id.empty()) seenIds_.insert(id);
            }
        }
        cv_.notify_one();
    }

    // Mark a command as completed (keeps it in dedup set, clears queue)
    // Call this after execution to prevent re-execution
    void MarkCompleted(const std::string& commandId) {
        // Already in seenIds_ — nothing to do.
        // Dedup set grows but is bounded by ClearHistory()
    }

    // Periodically clear old dedup history (call from command worker every N minutes)
    void ClearHistory() {
        std::lock_guard<std::mutex> lock(mutex_);
        seenIds_.clear();
    }

    // Drain the queue (for shutdown)
    void Clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        while (!queue_.empty()) {
            queue_.pop();
        }
        seenIds_.clear();
    }

    // Wake up any waiting consumer (for shutdown)
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
    std::unordered_set<std::string> seenIds_;  // Dedup: recently seen command IDs

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

    // Non-copyable
    CommandQueue(const CommandQueue&) = delete;
    CommandQueue& operator=(const CommandQueue&) = delete;
};

#endif // COMMAND_QUEUE_H
