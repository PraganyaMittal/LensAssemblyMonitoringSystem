#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <chrono>
#include <filesystem>

using json = nlohmann::json;

class RestClient;

class LogStructureSyncService {
public:
	LogStructureSyncService(AgentSettings* settings, RestClient* client);
	~LogStructureSyncService();

	LogStructureSyncService(const LogStructureSyncService&) = delete;
	LogStructureSyncService& operator=(const LogStructureSyncService&) = delete;

	void Start();
	void Stop();

	// Called by LogDirWatcher when the log directory structure changes.
	void RequestStructureSync();

	// Builds a JSON directory tree from the given path (used by RegistrationService too).
	static nlohmann::json BuildDirectoryTree(const std::filesystem::path& currentPath, const std::filesystem::path& rootPath);

private:
	void SyncWorkerLoop(std::stop_token stoken);
	void UploadDirectoryTree();

	// Non-owning raw pointers (owned by AgentCore)
	AgentSettings* settings_;
	RestClient* httpClient_;

	std::string lastSyncedStructure_;   // Dedup: skip POST if tree unchanged

	std::jthread syncThread_;
	std::mutex syncMutex_;
	std::condition_variable_any syncCv_;
	std::atomic<bool> syncRequested_{false};
	std::chrono::steady_clock::time_point lastRequestTime_{};  // Debounce timestamp
};
