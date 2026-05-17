#pragma once

#include "common/Types.h"
#include "network/RestClient.h"
#include "core/ConfigManager.h"
#include "utilities/FileUtils.h"
#include <nlohmann/json.hpp>
#include <atomic>

using json = nlohmann::json;

class HeartbeatService {
public:
	HeartbeatService();
	~HeartbeatService();

	HeartbeatService(const HeartbeatService&) = delete;
	HeartbeatService& operator=(const HeartbeatService&) = delete;

	bool SendHeartbeat(int mcId, bool isAppRunning, RestClient* client, json* commands);
	void CacheVersionInfo();



private:
	json BuildHeartbeatRequest(int mcId, bool isAppRunning);
	bool ParseHeartbeatResponse(const json& response, json* commands);



	std::string cachedAgentVersion_;
	std::string cachedServiceVersion_;
	std::string cachedAutoUpdaterVersion_;
	std::string cachedLaiVersion_;
};