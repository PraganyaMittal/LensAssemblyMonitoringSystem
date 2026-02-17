#pragma once

#include <string>
#include <vector>
#include <map>
#include <thread>
#include <atomic>
#include <mutex>
#include <functional>
#include <chrono>
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
    void CheckStableFiles();                     // Process files that have been stable for STABILITY_SECONDS
    bool TryReadFileShared(const std::wstring& filePath); // Open file with shared read access, then ProcessFile
    void ScanDirectoryForMissedFiles();           // Full directory scan fallback after buffer overflow

    std::wstring watchDirectory_;
    int machineId_;
    std::wstring lineNumber_;
    std::wstring mcNumber_;
    std::wstring serverUrl_;
    std::wstring lastProcessedFile_;

    std::atomic<bool> running_;
    std::thread monitorThread_;
    std::map<std::wstring, long long> processedFileTimestamps_; // Track filename -> last write time

    // File stability detection: wait for file to stop changing before processing
    std::map<std::wstring, std::chrono::steady_clock::time_point> pendingFiles_; // path -> last change time
    std::map<std::wstring, int> retryCount_; // path -> number of failed read attempts (max 5)

    // Event-Driven Monitoring (Overlapped I/O)
    void* dirHandle_; // HANDLE is void*
    void* overlapEvent_; // Event handle for overlapped I/O
    uint8_t changeBuffer_[1024 * 128]; // 128KB buffer for file events (handles ~1300 events)

    static const int MAX_READ_RETRIES = 5; // Max retries for locked file before giving up
};
