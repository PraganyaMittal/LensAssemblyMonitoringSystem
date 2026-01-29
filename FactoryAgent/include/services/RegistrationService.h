#ifndef REGISTRATION_SERVICE_H
#define REGISTRATION_SERVICE_H

#include "../common/Types.h"
#include "../network/HttpClient.h"
#include "../../third_party/json/json.hpp"

using json = nlohmann::json;

class RegistrationService {
public:
    RegistrationService();
    ~RegistrationService();

    bool RegisterWithServer(AgentSettings* settings, HttpClient* client);

private:
    json BuildRegistrationRequest(AgentSettings* settings);
    bool ParseRegistrationResponse(const json& response, int* mcId);

    RegistrationService(const RegistrationService&);
};

#endif