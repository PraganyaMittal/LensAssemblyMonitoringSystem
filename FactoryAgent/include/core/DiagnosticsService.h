#pragma once

#include "network/HttpClient.h"
#include "json/json.hpp"
#include <string>
#include <atomic>

using json = nlohmann::json;

class DiagnosticsService {
public:
	DiagnosticsService();
	~DiagnosticsService();

	DiagnosticsService(const DiagnosticsService&) = delete;
	DiagnosticsService& operator=(const DiagnosticsService&) = delete;

	bool SendDiagnostics(int mcId, const std::string& configFilePath, HttpClient* client);
	void MarkConfigDirty();

private:
	json BuildDiagnosticsRequest(int mcId, const std::string& configFilePath);

	ULONGLONG startTick_ = 0;

	std::string cachedConfigHash_;

	std::atomic<bool> configDirty_{true};
};
