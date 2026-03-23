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

    // Send diagnostics to the server. Called every DIAGNOSTICS_INTERVAL_SECONDS.
    bool SendDiagnostics(int mcId, const std::string& configFilePath, HttpClient* client);

    // Called by a file watcher when the config file changes on disk.
    void MarkConfigDirty();

private:
    json BuildDiagnosticsRequest(int mcId, const std::string& configFilePath);

    std::string cachedConfigHash_;
    std::atomic<bool> configDirty_{true};  // Start dirty so first run computes hash

    ULONGLONG startTick_ = 0;

    DiagnosticsService(const DiagnosticsService&) = delete;
    DiagnosticsService& operator=(const DiagnosticsService&) = delete;
};

#endif
