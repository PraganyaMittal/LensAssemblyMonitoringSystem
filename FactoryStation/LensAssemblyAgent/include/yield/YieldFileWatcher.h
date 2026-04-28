#pragma once

#include "YieldTypes.h"
#include <string>
#include <map>
#include <thread>
#include <atomic>
#include <functional>
#include <chrono>
#include <cstdint>



	class YieldFileWatcher {
	public:

		using FileReadyCallback = std::function<void(const std::wstring& filePath, const std::string& content)>;

		YieldFileWatcher();
		~YieldFileWatcher();


		void Initialize(const std::wstring& watchDirectory,
			int stabilitySeconds,
			int maxReadRetries,
			FileReadyCallback onFileReady);


		void Start();


		void Stop();

	private:
		void MonitorLoop();
		void CheckStableFiles();
		bool TryReadFileShared(const std::wstring& filePath);
		void ScanDirectoryForMissedFiles();


		std::wstring watchDirectory_;
		int stabilitySeconds_ = 15;
		int maxReadRetries_ = 5;
		FileReadyCallback onFileReady_;


		std::atomic<bool> running_{ false };
		std::thread monitorThread_;


		std::map<std::wstring, long long> processedFileTimestamps_;
		std::map<std::wstring, std::chrono::steady_clock::time_point> pendingFiles_;
		std::map<std::wstring, int> retryCount_;


		void* dirHandle_ = nullptr;
		void* overlapEvent_ = nullptr;
		uint8_t changeBuffer_[1024 * 128]{};
	};
