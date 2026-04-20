#pragma once

/// LogConfig — Configuration structures and JSON parser for log_config.json.
/// Each segment (agent, service, autoupdater) is parsed into a LogSegmentConfig.

#include <string>
#include <vector>

namespace LogEngine {

	/// Defines a single column in the log output.
	struct ColumnDef {
		std::string name;    // Column header name (e.g., "Datetime", "Level")
		std::string type;    // Column type (always "string" for now)
	};

	/// Configuration for one logging segment (agent, service, or autoupdater).
	/// Populated from the corresponding JSON segment in log_config.json.
	struct LogSegmentConfig {
		std::string rootFolder;               // Relative to baseDir (e.g., "logs\\agent")
		std::string fileNameFormat;           // Pattern with YYYYMMDDHHMM + {segment}
		std::string separator;                // Column delimiter (e.g., "\t")
		int         rotationIntervalMinutes;  // How often to rotate the log file
		int         retentionDays;            // Days to keep old log files
		std::vector<ColumnDef> columns;       // Column definitions for header line

		/// Returns true if this config has valid, usable values.
		bool IsValid() const {
			return !rootFolder.empty()
				&& !fileNameFormat.empty()
				&& !separator.empty()
				&& rotationIntervalMinutes > 0
				&& retentionDays > 0;
		}
	};

	/// Load a specific segment's config from log_config.json.
	/// @param configPath  Full path to log_config.json
	/// @param segment     Segment name: "agent", "service", or "autoupdater"
	/// @param outConfig   [out] Populated config struct
	/// @return true if parsed successfully, false if file missing/corrupt (caller should use defaults)
	bool LoadLogConfig(const std::string& configPath,
	                   const std::string& segment,
	                   LogSegmentConfig& outConfig);

	/// Build a default config for the given segment using compile-time defaults.
	/// Used as fallback when log_config.json is unavailable.
	LogSegmentConfig GetDefaultConfig(const std::string& segment);

} // namespace LogEngine
