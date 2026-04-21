#pragma once

/// LogDefaults — Compile-time fallback values used when log_config.json
/// is missing, corrupt, or contains invalid values.
/// These ensure logging always works even without a config file.

namespace LogEngine::Defaults {

	// Rotation: how often a new log file is created
	constexpr int    AGENT_ROTATION_INTERVAL_MINUTES     = 10;
	constexpr int    SERVICE_ROTATION_INTERVAL_MINUTES    = 60;
	constexpr int    AUTOUPDATER_ROTATION_INTERVAL_MINUTES = 1440;   // 24 hours

	// Retention: how many days old log files are kept before cleanup
	constexpr int    AGENT_RETENTION_DAYS      = 7;
	constexpr int    SERVICE_RETENTION_DAYS     = 15;
	constexpr int    AUTOUPDATER_RETENTION_DAYS = 30;

	// Generic fallbacks (when segment name is unknown)
	constexpr int    ROTATION_INTERVAL_MINUTES  = 60;
	constexpr int    RETENTION_DAYS             = 7;

	// Column separator
	constexpr const char* SEPARATOR = "\t";

	// File naming pattern
	constexpr const char* FILE_NAME_FORMAT = "YYYYMMDDHHMM_app.log";

	// Root folder (relative to baseDir)
	constexpr const char* AGENT_ROOT_FOLDER       = "logs\\agent";
	constexpr const char* SERVICE_ROOT_FOLDER      = "logs\\service";
	constexpr const char* AUTOUPDATER_ROOT_FOLDER  = "logs\\autoupdater";

	// Default columns
	constexpr int    DEFAULT_COLUMN_COUNT = 4;

} // namespace LogEngine::Defaults
