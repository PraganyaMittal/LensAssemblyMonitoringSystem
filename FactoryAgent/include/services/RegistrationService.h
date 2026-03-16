#ifndef REGISTRATION_SERVICE_H
#define REGISTRATION_SERVICE_H

#include "common/Types.h"
#include "network/HttpClient.h"
#include "json/json.hpp"

using json = nlohmann::json;

class RegistrationService {
public:
    RegistrationService();
    ~RegistrationService();

    bool RegisterWithServer(AgentSettings* settings, HttpClient* client, std::string& errorMessage);
    bool FetchSettingsFromServer(AgentSettings* settings, HttpClient* client, std::string& errorMessage);

private:
    json BuildRegistrationRequest(AgentSettings* settings);
    bool ParseRegistrationResponse(const json& response, int* mcId, AgentSettings* settings, std::string& errorMessage);

    RegistrationService(const RegistrationService&);
};

#endif