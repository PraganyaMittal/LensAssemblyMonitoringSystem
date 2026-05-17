#pragma once

#include "network/RestClient.h"
#include <nlohmann/json.hpp>
#include <string>
#include <atomic>

using json = nlohmann::json;

class DiagnosticsService {
public:
	DiagnosticsService();
	~DiagnosticsService();

	DiagnosticsService(const DiagnosticsService&) = delete;
	DiagnosticsService& operator=(const DiagnosticsService&) = delete;

	bool SendDiagnostics(int mcId, const std::string& configFilePath, RestClient* client);

private:
	json BuildDiagnosticsRequest(int mcId, const std::string& configFilePath);

	ULONGLONG startTick_ = 0;
};
