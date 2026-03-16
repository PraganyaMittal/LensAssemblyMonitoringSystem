#include "monitoring/FileMonitor.h"
#include "utilities/FileUtils.h"
#include "common/Constants.h"

FileMonitor::FileMonitor() {
    monitorThread_ = NULL;
    isMonitoring_ = false;
    callback_ = NULL;
    userData_ = NULL;
}

FileMonitor::~FileMonitor() {
    StopMonitoring();
}

bool FileMonitor::StartMonitoring(const std::string& filePath, FileChangeCallback callback, void* userData) {
    if (isMonitoring_) {
        return false;
    }

    filePath_ = filePath;
    callback_ = callback;
    userData_ = userData;
    isMonitoring_ = true;

    GetFileHash(filePath_, lastHash_);

    monitorThread_ = CreateThread(NULL, 0, MonitorThreadFunc, this, 0, NULL);
    return (monitorThread_ != NULL);
}

void FileMonitor::StopMonitoring() {
    if (isMonitoring_) {
        isMonitoring_ = false;
        if (monitorThread_) {
            WaitForSingleObject(monitorThread_, 5000);
            CloseHandle(monitorThread_);
            monitorThread_ = NULL;
        }
    }
}

bool FileMonitor::IsMonitoring() const {
    return isMonitoring_;
}

DWORD WINAPI FileMonitor::MonitorThreadFunc(LPVOID param) {
    FileMonitor* monitor = (FileMonitor*)param;
    monitor->MonitorLoop();
    return 0;
}

void FileMonitor::MonitorLoop() {
    while (isMonitoring_) {
        std::string currentHash;
        if (GetFileHash(filePath_, currentHash)) {
            if (currentHash != lastHash_) {
                lastHash_ = currentHash;
                if (callback_ != NULL) {
                    std::string content;
                    if (FileUtils::ReadFileContent(filePath_, content)) {
                        callback_(content, userData_);
                    }
                }
            }
        }

        Sleep(AgentConstants::FILE_MONITOR_INTERVAL_MS);
    }
}

bool FileMonitor::GetFileHash(const std::string& filePath, std::string& hash) {
    HANDLE hFile = CreateFileA(filePath.c_str(), GENERIC_READ, FILE_SHARE_READ,
        NULL, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, NULL);
    if (hFile == INVALID_HANDLE_VALUE) {
        return false;
    }

    LARGE_INTEGER fileSize;
    if (!GetFileSizeEx(hFile, &fileSize)) {
        CloseHandle(hFile);
        return false;
    }

    char buffer[32];
    sprintf_s(buffer, sizeof(buffer), "%lld", fileSize.QuadPart);
    hash = buffer;

    FILETIME ftModified;
    if (GetFileTime(hFile, NULL, NULL, &ftModified)) {
        sprintf_s(buffer, sizeof(buffer), "_%u", ftModified.dwLowDateTime);
        hash += buffer;
    }

    CloseHandle(hFile);
    return true;
}