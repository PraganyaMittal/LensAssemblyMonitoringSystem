#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <filesystem>

using json = nlohmann::json;

class RestClient;

/// @brief Syncs the log directory tree structure to the backend server.
///        Triggered by LogDirWatcher when file/folder changes are detected.
///        Uses std::jthread (C++20) for automatic thread lifecycle management.
class LogStructureSyncService {
public:
	LogStructureSyncService(AgentSettings* settings, RestClient* client);
	~LogStructureSyncService();

	LogStructureSyncService(const LogStructureSyncService&) = delete;
	LogStructureSyncService& operator=(const LogStructureSyncService&) = delete;

	void Start();
	void Stop();

	/// Called by LogDirWatcher when the log directory structure changes.
	void RequestStructureSync();

	/// Builds a JSON directory tree from the given path.
	/// Also used by RegistrationService during initial registration.
	static std::string FormatTime(std::filesystem::file_time_type ftime);
	static nlohmann::json BuildDirectoryTree(const std::filesystem::path& currentPath, const std::filesystem::path& rootPath);

private:
	void SyncWorkerLoop(std::stop_token stoken);
	void UploadDirectoryTree();

	// Raw pointers (non-owning)
	AgentSettings* settings_;
	RestClient* httpClient_;

	// String state — used to deduplicate unchanged structures
	std::string lastSyncedStructure_;

	// Sync thread state — jthread provides cooperative cancellation
	std::jthread syncThread_;
	std::mutex syncMutex_;
	std::condition_variable_any syncCv_;
	std::atomic<bool> syncRequested_{false};
};
