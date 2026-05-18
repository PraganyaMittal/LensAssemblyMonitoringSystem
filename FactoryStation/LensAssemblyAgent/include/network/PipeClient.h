#pragma once





#include <windows.h>
#include <string>

class PipeClient {
public:
    PipeClient() = default;
    ~PipeClient();

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;

    

    
    
    
    bool SendDeployRequest(const std::string& payload);
    bool SendDecommissionRequest(const std::string& payload);

    
    
    static bool IsServiceRunning(const std::wstring& serviceName);

    bool IsConnected() const;

private:
    bool Connect(int maxRetries = 3, DWORD retryDelayMs = 1000);
    bool SendMessage(const std::string& message);
    std::string ReadMessage(DWORD timeoutMs = 5000);
    void Disconnect();

    HANDLE hPipe_ = INVALID_HANDLE_VALUE;
};
