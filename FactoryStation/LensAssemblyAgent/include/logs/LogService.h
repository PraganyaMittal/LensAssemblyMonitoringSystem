#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>

using json = nlohmann::json;

class RestClient;

/// @brief Manages log directory synchronization and filtered log file uploads.
///        Uses std::jthread (C++20) for automatic thread lifecycle management.
class LogService {
public:
	LogService(AgentSettings* settings, RestClient* client);
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
	void SyncWorkerLoop(std::stop_token stoken);
	bool UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
		const std::wstring& endpoint, const std::string& pcIdStr);

	// Raw pointers (non-owning)
	AgentSettings* settings_;
	RestClient* httpClient_;

	// String state
	std::string lastSyncedStructure_;

	// Sync thread state — jthread provides cooperative cancellation
	std::jthread syncThread_;
	std::mutex syncMutex_;
	std::condition_variable_any syncCv_;
	std::atomic<bool> syncRequested_{false};
};