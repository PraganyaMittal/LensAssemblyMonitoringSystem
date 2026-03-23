#pragma once

#include "common/Types.h"
#include "json/json.hpp"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>

using json = nlohmann::json;

class HttpClient;

class LogService {
public:
	LogService(AgentSettings* settings, HttpClient* client);
	~LogService();

	LogService(const LogService&) = delete;
	LogService& operator=(const LogService&) = delete;

	void Start();
	void Stop();

	void TriggerAsyncSync();
	void SyncLogsToServer();
	void UploadRequestedFile(const std::string& filePath, const std::string& requestId);

	static std::string FormatTime(std::filesystem::file_time_type ftime);
	static nlohmann::json BuildDirectoryTree(const std::filesystem::path& currentPath, const std::filesystem::path& rootPath);

private:
	void SyncWorkerLoop();

	// Raw pointers (non-owning)
	AgentSettings* settings_;
	HttpClient* httpClient_;

	// String state
	std::string lastSyncedStructure_;

	// Sync thread state
	std::thread syncThread_;
	std::mutex syncMutex_;
	std::condition_variable syncCv_;
	std::atomic<bool> syncRequested_{false};
	std::atomic<bool> running_{false};
};