#pragma once

#include <string>
#include <vector>
#include <map>
#include <thread>
#include <atomic>
#include <mutex>
#include <functional>
#include "../third_party/json/json.hpp"

using json = nlohmann::json;

class YieldMonitor {
public:
    YieldMonitor();
    ~YieldMonitor();

    // Initialize with the directory to watch (e.g. C:\LAI_Result_Current)
    void Initialize(const std::wstring& watchDirectory, int machineId, const std::wstring& lineNum, const std::wstring& mcNum, const std::wstring& serverUrl);
    
    // Start the monitoring thread
    void Start();
    
    // Updates the machine ID (called after registration)
    void UpdateMachineId(int machineId);
    
    // Stop the monitoring thread
    void Stop();

private:
    void MonitorLoop();
    void ProcessFile(const std::wstring& filePath);
    bool ParseYieldFromXml(const std::string& content, int& goodCount, int& totalCount, std::string& trayId);
    void SendReport(int goodCount, int totalCount, const std::string& trayId, double yieldPercentage, const std::string& dateString);

    std::wstring watchDirectory_;
    int machineId_;
    std::wstring lineNumber_;
    std::wstring mcNumber_;
    std::wstring serverUrl_;
    std::wstring lastProcessedFile_;

    std::atomic<bool> running_;
    std::thread monitorThread_;
    std::map<std::wstring, long long> processedFileTimestamps_; // Track filename -> last write time

    // Event-Driven Monitoring
    void* dirHandle_; // HANDLE is void*
    uint8_t changeBuffer_[1024 * 64]; // 64KB buffer for file events
};
