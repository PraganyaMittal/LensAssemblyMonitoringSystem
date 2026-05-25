#pragma once

// ============================================================================
// CleanupEngine.h — File and directory cleanup with fallback scheduling
// ============================================================================
// Extracted from main.cpp. Handles best-effort recursive deletion with
// MoveFileEx(MOVEFILE_DELAY_UNTIL_REBOOT) fallback for locked files.
// ============================================================================

#include <windows.h>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

namespace CleanupEngine {

	struct Stats {
		int deleted = 0;
		int scheduled = 0;  // Scheduled for deletion on reboot
		int failed = 0;
	};

	/// Delete a file, or schedule for reboot deletion if locked.
	inline void DeleteFileOrSchedule(const fs::path& path, Stats& stats) {
		DWORD attrs = GetFileAttributesW(path.c_str());
		if (attrs == INVALID_FILE_ATTRIBUTES) {
			DWORD err = GetLastError();
			if (err == ERROR_FILE_NOT_FOUND || err == ERROR_PATH_NOT_FOUND) return;
		}

		SetFileAttributesW(path.c_str(), FILE_ATTRIBUTE_NORMAL);
		if (DeleteFileW(path.c_str())) {
			stats.deleted++;
			return;
		}
		if (MoveFileExW(path.c_str(), NULL, MOVEFILE_DELAY_UNTIL_REBOOT)) {
			stats.scheduled++;
			return;
		}
		stats.failed++;
	}

	/// Remove a directory, or schedule for reboot deletion if locked.
	inline void RemoveDirOrSchedule(const fs::path& path, Stats& stats) {
		if (RemoveDirectoryW(path.c_str())) {
			stats.deleted++;
			return;
		}
		if (MoveFileExW(path.c_str(), NULL, MOVEFILE_DELAY_UNTIL_REBOOT)) {
			stats.scheduled++;
			return;
		}
		stats.failed++;
	}

	/// Recursively remove a directory tree with best-effort cleanup.
	inline void RemoveTreeBestEffort(const fs::path& path, Stats& stats) {
		std::error_code ec;
		if (!fs::exists(path, ec)) return;

		if (!fs::is_directory(path, ec) || fs::is_symlink(path, ec)) {
			DeleteFileOrSchedule(path, stats);
			return;
		}

		for (const auto& entry : fs::directory_iterator(path, fs::directory_options::skip_permission_denied, ec)) {
			if (ec) {
				stats.failed++;
				ec.clear();
				continue;
			}
			RemoveTreeBestEffort(entry.path(), stats);
		}

		RemoveDirOrSchedule(path, stats);
	}

} // namespace CleanupEngine
