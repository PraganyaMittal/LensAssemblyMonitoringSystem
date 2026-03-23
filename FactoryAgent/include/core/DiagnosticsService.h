#ifndef DIAGNOSTICS_SERVICE_H
#define DIAGNOSTICS_SERVICE_H

#include "network/HttpClient.h"
#include "json/json.hpp"
#include <string>
#include <atomic>

using json = nlohmann::json;

class DiagnosticsService {
public:
    DiagnosticsService();
    ~DiagnosticsService();

    
    bool SendDiagnostics(int mcId, const std::string& configFilePath, HttpClient* client);

    
    void MarkConfigDirty();

private:
    json BuildDiagnosticsRequest(int mcId, const std::string& configFilePath);

    std::string cachedConfigHash_;
    std::atomic<bool> configDirty_{true};  

    ULONGLONG startTick_ = 0;

    DiagnosticsService(const DiagnosticsService&) = delete;
    DiagnosticsService& operator=(const DiagnosticsService&) = delete;
};

#endif
