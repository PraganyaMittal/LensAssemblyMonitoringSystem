#pragma once

#include <string>
#include <cstdint>

namespace Yield {

    /**
     * YieldResult — parsed output from a single tray XML file.
     * Pure data struct, no logic.
     */
    struct YieldResult {
        int         goodCount       = 0;
        int         totalCount      = 0;
        double      yieldPercentage = 0.0;
        std::string trayId;         // Filename stem (e.g., "Lens_Tray1")
        std::string dateString;     // "YYYY-MM-DD" extracted from file path
    };

    /**
     * YieldConfig — all configuration for the yield monitoring subsystem.
     * Populated once at startup, threaded through to all sub-components.
     */
    struct YieldConfig {
        std::wstring watchDirectory;
        int          machineId        = 0;
        std::wstring lineNumber;
        std::wstring mcNumber;
        std::wstring serverUrl;
        int          stabilitySeconds = 15;   // seconds file must be unchanged before processing
        int          maxReadRetries   = 5;    // max attempts to open a locked file
        int          uploadQueueLimit = 1000; // max pending uploads before dropping
    };

} // namespace Yield
