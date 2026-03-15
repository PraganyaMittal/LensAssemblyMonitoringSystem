#pragma once



#include <windows.h>
#include <string>
#include <functional>
#include <atomic>
#include <mutex>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    
    void SetShutdownCallback(std::function<void()> callback);

    
    
    bool Connect(int maxRetries = 30, DWORD retryDelayMs = 2000);

    
    
    void RunLoop(std::atomic<bool>& stopFlag);

    
    void Disconnect();

    
    
    
    bool NotifyUpdate(const std::string& payload);

    bool IsConnected() const;

private:
    bool SendMessage(const std::string& message);
    std::string ReadMessage(DWORD timeoutMs = 5000);
    bool HandleServerCommand(const std::string& command);

    HANDLE hPipe_ = INVALID_HANDLE_VALUE;
    std::function<void()> shutdownCallback_;

    
    std::atomic<bool> pendingUpdate_{false};
    std::string       pendingPayload_;
    std::mutex        updateMutex_;
};
