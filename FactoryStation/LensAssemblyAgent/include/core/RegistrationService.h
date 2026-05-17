#pragma once

#include "common/Types.h"
#include "network/RestClient.h"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class RegistrationService {
public:
	RegistrationService();
	~RegistrationService();

	RegistrationService(const RegistrationService&) = delete;
	RegistrationService& operator=(const RegistrationService&) = delete;

	bool RegisterWithServer(AgentSettings* settings, RestClient* client, std::string& errorMessage);
	bool FetchSettingsFromServer(AgentSettings* settings, RestClient* client, std::string& errorMessage);

private:
	json BuildRegistrationRequest(AgentSettings* settings);
	bool ParseRegistrationResponse(const json& response, int* mcId, AgentSettings* settings, std::string& errorMessage);
};