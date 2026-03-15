#pragma once

#include "YieldTypes.h"
#include <string>

namespace Yield {

    
    class YieldXmlParser {
    public:
        
        static bool Parse(const std::string& xmlContent, YieldResult& result);

        
        static std::string ExtractDateFromPath(const std::string& filePath);

        
        static std::string ExtractTrayIdFromPath(const std::string& filePath);

    private:
        YieldXmlParser() = delete; 
    };

} 
