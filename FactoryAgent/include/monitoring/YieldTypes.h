#pragma once

#include <string>
#include <cstdint>

namespace Yield {

    
    struct YieldResult {
        int         goodCount       = 0;
        int         totalCount      = 0;
        double      yieldPercentage = 0.0;
        std::string trayId;         
        std::string dateString;     
    };

    
    struct YieldConfig {
        std::wstring watchDirectory;
        int          machineId        = 0;
        std::wstring lineNumber;
        std::wstring mcNumber;
        std::wstring serverUrl;
        int          stabilitySeconds = 15;   
        int          maxReadRetries   = 5;    
        int          uploadQueueLimit = 1000; 
    };

} 
