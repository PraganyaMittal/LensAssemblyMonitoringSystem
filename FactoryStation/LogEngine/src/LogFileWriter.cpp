#include "LogFileWriter.h"
#include <filesystem>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <chrono>

namespace fs = std::filesystem;

namespace LogEngine {

	LogFileWriter::LogFileWriter() = default;

	LogFileWriter::~LogFileWriter() {
		Close();
	}

	// ── Public API ──

	bool LogFileWriter::Initialize(const std::string& baseDir, const LogSegmentConfig& config) {
		std::lock_guard<std::mutex> lock(mutex_);

		baseDir_ = baseDir;
		config_ = config;

		// Ensure baseDir ends with backslash
		if (!baseDir_.empty() && baseDir_.back() != '\\') {
			baseDir_ += '\\';
		}

		// Open the first log file
		OpenNewFile();

		if (!fileStream_.is_open()) {
			return false;
		}

		// Run retention cleanup on startup
		try {
			CleanupOldFiles();
		} catch (...) {}

		// Start the rotation scheduler thread
		stopFlag_.store(false);
		lastRotationTime_ = std::chrono::steady_clock::now();
		schedulerThread_ = std::thread(&LogFileWriter::SchedulerLoop, this);

		return true;
	}

	void LogFileWriter::WriteLine(const std::string& line) {
		std::lock_guard<std::mutex> lock(mutex_);

		if (!fileStream_.is_open()) return;

		fileStream_ << line << std::endl;
		fileStream_.flush();
	}

	void LogFileWriter::Close() {
		// Signal the scheduler to stop
		stopFlag_.store(true);
		if (schedulerThread_.joinable()) {
			schedulerThread_.join();
		}

		std::lock_guard<std::mutex> lock(mutex_);
		if (fileStream_.is_open()) {
			fileStream_.flush();
			fileStream_.close();
		}
	}

	bool LogFileWriter::IsOpen() const {
		std::lock_guard<std::mutex> lock(mutex_);
		return fileStream_.is_open();
	}

	// ── File Management ──

	std::string LogFileWriter::MakeDateToken() const {
		auto now = std::chrono::system_clock::now();
		auto time = std::chrono::system_clock::to_time_t(now);
		struct tm buf;
		localtime_s(&buf, &time);

		std::ostringstream oss;
		oss << std::setfill('0')
		    << (buf.tm_year + 1900)
		    << std::setw(2) << (buf.tm_mon + 1)
		    << std::setw(2) << buf.tm_mday
		    << std::setw(2) << buf.tm_hour
		    << std::setw(2) << buf.tm_min;
		return oss.str();
	}

	std::string LogFileWriter::BuildLogFolderPath() const {
		auto now = std::chrono::system_clock::now();
		auto time = std::chrono::system_clock::to_time_t(now);
		struct tm buf;
		localtime_s(&buf, &time);

		// Build: baseDir\rootFolder\YYYY\MM\DD
		std::ostringstream oss;
		oss << baseDir_ << config_.rootFolder << "\\"
		    << (buf.tm_year + 1900) << "\\"
		    << std::setfill('0') << std::setw(2) << (buf.tm_mon + 1) << "\\"
		    << std::setw(2) << buf.tm_mday;
		return oss.str();
	}

	std::string LogFileWriter::BuildLogFilePath(const std::string& folderPath) const {
		// Replace YYYYMMDDHHMM tokens in fileNameFormat
		std::string dateToken = MakeDateToken();
		std::string fileName = config_.fileNameFormat;

		// Replace YYYYMMDDHHMM as a whole token
		size_t tokenPos = fileName.find("YYYYMMDDHHMM");
		if (tokenPos != std::string::npos) {
			fileName.replace(tokenPos, 12, dateToken);
		}

		return folderPath + "\\" + fileName;
	}

	void LogFileWriter::WriteColumnHeader() {
		if (config_.columns.empty()) return;

		std::string header;
		for (size_t i = 0; i < config_.columns.size(); i++) {
			if (i > 0) header += config_.separator;
			header += config_.columns[i].name;
		}

		fileStream_ << header << std::endl;
		fileStream_.flush();
	}

	void LogFileWriter::OpenNewFile() {
		// Close existing file if open
		if (fileStream_.is_open()) {
			fileStream_.flush();
			fileStream_.close();
		}

		// Build folder path with year/month/date hierarchy
		std::string folderPath = BuildLogFolderPath();

		// Create directories
		try {
			fs::create_directories(folderPath);
		} catch (...) {
			return;
		}

		// Build file path
		currentFilePath_ = BuildLogFilePath(folderPath);
		lastDateToken_ = MakeDateToken();

		// Check if file exists — if so, append (no header)
		bool fileExists = fs::exists(currentFilePath_);

		fileStream_.open(currentFilePath_, std::ios::app);
		if (fileStream_.is_open() && !fileExists) {
			WriteColumnHeader();
		}
	}

	// ── Rotation ──

	void LogFileWriter::RotateIfNeeded() {
		auto now = std::chrono::steady_clock::now();
		auto elapsed = std::chrono::duration_cast<std::chrono::minutes>(now - lastRotationTime_);

		if (elapsed.count() < config_.rotationIntervalMinutes) {
			return;
		}

		// Time to rotate
		std::lock_guard<std::mutex> lock(mutex_);

		// Close current file and open a new one
		OpenNewFile();
		lastRotationTime_ = std::chrono::steady_clock::now();

		// Run retention cleanup after rotation
		try {
			CleanupOldFiles();
		} catch (...) {}
	}

	// ── Retention ──

	void LogFileWriter::CleanupOldFiles() const {
		std::string rootPath = baseDir_ + config_.rootFolder;

		if (!fs::exists(rootPath)) return;

		auto now = fs::file_time_type::clock::now();
		auto cutoffFileTime = now - std::chrono::hours(24 * config_.retentionDays);

		try {
			for (auto& entry : fs::recursive_directory_iterator(rootPath)) {
				if (!entry.is_regular_file()) continue;

				// Only delete .log files
				if (entry.path().extension() != ".log") continue;

				auto fileTime = fs::last_write_time(entry);
				if (fileTime < cutoffFileTime) {
					fs::remove(entry.path());
				}
			}

			// Remove empty year/month/date directories
			RemoveEmptyDirectories(rootPath);
		} catch (...) {
			// Best effort — don't crash the application over cleanup failures
		}
	}

	void LogFileWriter::RemoveEmptyDirectories(const std::string& rootPath) const {
		try {
			// Iterate in reverse depth order: deepest dirs first
			std::vector<fs::path> dirs;
			for (auto& entry : fs::recursive_directory_iterator(rootPath)) {
				if (entry.is_directory()) {
					dirs.push_back(entry.path());
				}
			}

			// Sort by path length descending (deepest first)
			std::sort(dirs.begin(), dirs.end(), [](const fs::path& a, const fs::path& b) {
				return a.wstring().size() > b.wstring().size();
			});

			for (const auto& dir : dirs) {
				if (fs::is_empty(dir)) {
					fs::remove(dir);
				}
			}
		} catch (...) {}
	}

	// ── Scheduler Thread ──

	void LogFileWriter::SchedulerLoop() {
		while (!stopFlag_.load()) {
			// Sleep for 30 seconds between checks (responsive enough, low CPU overhead)
			for (int i = 0; i < 60 && !stopFlag_.load(); i++) {
				std::this_thread::sleep_for(std::chrono::milliseconds(500));
			}

			if (stopFlag_.load()) break;

			RotateIfNeeded();
		}
	}

} // namespace LogEngine
