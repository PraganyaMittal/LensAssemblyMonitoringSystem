#pragma once

/// LogFileWriter — Internal file I/O, rotation, and retention engine.
/// NOT part of the public API. Used only by LogEngine.cpp internally.

#include "LogConfig.h"
#include <string>
#include <fstream>
#include <mutex>
#include <thread>
#include <atomic>
#include <chrono>

namespace LogEngine {

	class LogFileWriter {
	public:
		LogFileWriter();
		~LogFileWriter();

		// Non-copyable
		LogFileWriter(const LogFileWriter&) = delete;
		LogFileWriter& operator=(const LogFileWriter&) = delete;

		/// Initialize the writer with config and base directory.
		/// Creates folder structure, opens the first log file, starts rotation thread.
		bool Initialize(const std::string& baseDir, const LogSegmentConfig& config);

		/// Write a single pre-formatted log line to the current file.
		/// Thread-safe.
		void WriteLine(const std::string& line);

		/// Flush and close the current file. Stop rotation thread.
		void Close();

		/// Check if the writer is active and ready for writes.
		bool IsOpen() const;

	private:
		// ── File management ──
		std::string BuildLogFolderPath() const;
		std::string BuildLogFilePath(const std::string& folderPath) const;
		std::string MakeDateToken() const;
		void WriteColumnHeader();

		// ── Rotation ──
		void RotateIfNeeded();
		void OpenNewFile();

		// ── Retention ──
		void CleanupOldFiles() const;
		void RemoveEmptyDirectories(const std::string& rootPath) const;

		// ── Scheduler thread ──
		void SchedulerLoop();

		// ── State ──
		LogSegmentConfig config_;
		std::string baseDir_;          // Absolute base directory (e.g., "C:\\LAMS_Dirs\\")
		std::string currentFilePath_;
		std::string lastDateToken_;    // Tracks the date token when current file was opened

		std::ofstream fileStream_;
		mutable std::mutex mutex_;

		// ── Background scheduler ──
		std::thread schedulerThread_;
		std::atomic<bool> stopFlag_{false};
		std::chrono::steady_clock::time_point lastRotationTime_;
	};

} // namespace LogEngine
