#include "LogConfig.h"
#include "LogDefaults.h"
#include <fstream>
#include <sstream>

// ── Minimal JSON parsing helpers ──
// Lightweight extraction — no external dependency needed.
// Handles nested objects like { "agent": { "root_folder": "..." } }

namespace {

	/// Skip whitespace in JSON string starting at pos.
	void SkipWhitespace(const std::string& json, size_t& pos) {
		while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
		       json[pos] == '\n' || json[pos] == '\r')) {
			pos++;
		}
	}

	/// Extract a quoted string value starting at pos (expects pos to be at opening quote).
	std::string ExtractQuotedString(const std::string& json, size_t& pos) {
		if (pos >= json.size() || json[pos] != '"') return "";
		pos++; // skip opening quote

		std::string result;
		while (pos < json.size() && json[pos] != '"') {
			if (json[pos] == '\\' && pos + 1 < json.size()) {
				pos++;
				if (json[pos] == '\\') result += '\\';
				else if (json[pos] == '"') result += '"';
				else if (json[pos] == 'n') result += '\n';
				else if (json[pos] == 't') result += '\t';
				else result += json[pos];
			} else {
				result += json[pos];
			}
			pos++;
		}
		if (pos < json.size()) pos++; // skip closing quote
		return result;
	}

	/// Find a key in a JSON object and return position after the colon.
	/// Returns std::string::npos if key not found.
	size_t FindKey(const std::string& json, const std::string& key, size_t startPos = 0) {
		std::string search = "\"" + key + "\"";
		size_t keyPos = json.find(search, startPos);
		if (keyPos == std::string::npos) return std::string::npos;

		size_t colonPos = json.find(':', keyPos + search.size());
		if (colonPos == std::string::npos) return std::string::npos;

		colonPos++;
		SkipWhitespace(json, colonPos);
		return colonPos;
	}

	/// Extract a string value for a given key.
	std::string ExtractString(const std::string& json, const std::string& key, size_t startPos = 0) {
		size_t pos = FindKey(json, key, startPos);
		if (pos == std::string::npos) return "";
		return ExtractQuotedString(json, pos);
	}

	/// Extract an integer value for a given key.
	int ExtractInt(const std::string& json, const std::string& key, int defaultVal, size_t startPos = 0) {
		size_t pos = FindKey(json, key, startPos);
		if (pos == std::string::npos) return defaultVal;

		std::string numStr;
		while (pos < json.size() && (isdigit(json[pos]) || json[pos] == '-')) {
			numStr += json[pos];
			pos++;
		}
		try {
			return std::stoi(numStr);
		} catch (...) {
			return defaultVal;
		}
	}

	/// Find the bounds of a JSON object { ... } starting at pos.
	/// Returns the position of the closing brace + 1.
	size_t FindObjectEnd(const std::string& json, size_t startPos) {
		if (startPos >= json.size() || json[startPos] != '{') return std::string::npos;

		int depth = 0;
		for (size_t i = startPos; i < json.size(); i++) {
			if (json[i] == '{') depth++;
			else if (json[i] == '}') {
				depth--;
				if (depth == 0) return i + 1;
			}
			else if (json[i] == '"') {
				// Skip quoted strings to avoid counting braces inside strings
				i++;
				while (i < json.size() && json[i] != '"') {
					if (json[i] == '\\') i++;
					i++;
				}
			}
		}
		return std::string::npos;
	}

	/// Extract a sub-object as a string for a given key.
	std::string ExtractObject(const std::string& json, const std::string& key) {
		size_t pos = FindKey(json, key);
		if (pos == std::string::npos) return "";
		if (pos >= json.size() || json[pos] != '{') return "";

		size_t end = FindObjectEnd(json, pos);
		if (end == std::string::npos) return "";
		return json.substr(pos, end - pos);
	}

	/// Parse the columns array from a segment JSON object.
	std::vector<LogEngine::ColumnDef> ParseColumns(const std::string& segmentJson) {
		std::vector<LogEngine::ColumnDef> columns;

		size_t arrStart = segmentJson.find("\"columns\"");
		if (arrStart == std::string::npos) return columns;

		arrStart = segmentJson.find('[', arrStart);
		if (arrStart == std::string::npos) return columns;

		size_t arrEnd = segmentJson.find(']', arrStart);
		if (arrEnd == std::string::npos) return columns;

		std::string arrContent = segmentJson.substr(arrStart, arrEnd - arrStart + 1);

		// Find each { } block within the array
		size_t pos = 0;
		while (pos < arrContent.size()) {
			size_t objStart = arrContent.find('{', pos);
			if (objStart == std::string::npos) break;

			size_t objEnd = FindObjectEnd(arrContent, objStart);
			if (objEnd == std::string::npos) break;

			std::string colJson = arrContent.substr(objStart, objEnd - objStart);
			LogEngine::ColumnDef col;
			col.name = ExtractString(colJson, "name");
			col.type = ExtractString(colJson, "type");
			if (!col.name.empty()) {
				columns.push_back(col);
			}
			pos = objEnd;
		}

		return columns;
	}

} // anonymous namespace


namespace LogEngine {

	bool LoadLogConfig(const std::string& configPath,
	                   const std::string& segment,
	                   LogSegmentConfig& outConfig) {
		// Read the entire file
		std::ifstream file(configPath);
		if (!file.is_open()) {
			return false;
		}

		std::string content((std::istreambuf_iterator<char>(file)),
		                     std::istreambuf_iterator<char>());
		file.close();

		if (content.empty()) {
			return false;
		}

		// Extract the segment object (e.g., "agent": { ... })
		std::string segmentJson = ExtractObject(content, segment);
		if (segmentJson.empty()) {
			return false;
		}

		// Parse each field
		outConfig.rootFolder = ExtractString(segmentJson, "root_folder");
		outConfig.fileNameFormat = ExtractString(segmentJson, "file_name_format");
		outConfig.separator = ExtractString(segmentJson, "separator");
		outConfig.rotationIntervalMinutes = ExtractInt(segmentJson, "rotation_interval_minutes", 0);
		outConfig.retentionDays = ExtractInt(segmentJson, "retention_days", 0);
		outConfig.columns = ParseColumns(segmentJson);

		return outConfig.IsValid();
	}

	LogSegmentConfig GetDefaultConfig(const std::string& segment) {
		LogSegmentConfig config;
		config.separator = Defaults::SEPARATOR;

		if (segment == "agent") {
			config.rootFolder = Defaults::AGENT_ROOT_FOLDER;
			config.fileNameFormat = "YYYYMMDDHHMM_agent.log";
			config.rotationIntervalMinutes = Defaults::AGENT_ROTATION_INTERVAL_MINUTES;
			config.retentionDays = Defaults::AGENT_RETENTION_DAYS;
		}
		else if (segment == "service") {
			config.rootFolder = Defaults::SERVICE_ROOT_FOLDER;
			config.fileNameFormat = "YYYYMMDDHHMM_service.log";
			config.rotationIntervalMinutes = Defaults::SERVICE_ROTATION_INTERVAL_MINUTES;
			config.retentionDays = Defaults::SERVICE_RETENTION_DAYS;
		}
		else if (segment == "autoupdater") {
			config.rootFolder = Defaults::AUTOUPDATER_ROOT_FOLDER;
			config.fileNameFormat = "YYYYMMDDHHMM_autoupdater.log";
			config.rotationIntervalMinutes = Defaults::AUTOUPDATER_ROTATION_INTERVAL_MINUTES;
			config.retentionDays = Defaults::AUTOUPDATER_RETENTION_DAYS;
		}
		else {
			config.rootFolder = Defaults::AGENT_ROOT_FOLDER;
			config.fileNameFormat = Defaults::FILE_NAME_FORMAT;
			config.rotationIntervalMinutes = Defaults::ROTATION_INTERVAL_MINUTES;
			config.retentionDays = Defaults::RETENTION_DAYS;
		}

		// Default columns: Datetime, Level, Module, Message
		config.columns = {
			{"Datetime", "string"},
			{"Level",    "string"},
			{"Module",   "string"},
			{"Message",  "string"}
		};

		return config;
	}

} // namespace LogEngine
