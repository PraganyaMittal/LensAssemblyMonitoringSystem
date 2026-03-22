#include "yield/YieldXmlParser.h"
#include "core/Logger.h"
#include <regex>


    bool YieldXmlParser::Parse(const std::string& xmlContent, YieldResult& result)
    {
        try {
            
            
            std::regex trayRegex("TrayId=\"([^\"]+)\"");
            std::smatch trayMatch;
            if (std::regex_search(xmlContent, trayMatch, trayRegex)) {
                result.trayId = trayMatch[1].str();
            } else {
                result.trayId = "Unknown";
            }

            
            
            std::regex binRegex("<Bin\\s+BinCode=\"([OX])\"\\s+BinCount=\"(\\d+)\"");
            auto it  = std::sregex_iterator(xmlContent.begin(), xmlContent.end(), binRegex);
            auto end = std::sregex_iterator();

            int oCount = 0;
            int xCount = 0;

            for (; it != end; ++it) {
                std::smatch match = *it;
                std::string code  = match[1].str();
                int count         = std::stoi(match[2].str());

                if (code == "O") {
                    oCount = count;
                } else if (code == "X") {
                    xCount = count;
                }
            }

            result.goodCount  = oCount;
            result.totalCount = oCount + xCount;

            
            if (result.totalCount == 0 && result.goodCount == 0) {
                return false;
            }

            
            result.yieldPercentage = (result.totalCount > 0)
                ? (static_cast<double>(result.goodCount) / result.totalCount) * 100.0
                : 0.0;

            return true;
        }
        catch (...) {
            return false;
        }
    }

    std::string YieldXmlParser::ExtractDateFromPath(const std::string& filePath)
    {
        
        std::regex dateRegex(R"((\d{4})[\/\\](\d{2})[\/\\](\d{2}))");
        std::smatch dateMatch;
        if (std::regex_search(filePath, dateMatch, dateRegex)) {
            return dateMatch[1].str() + "-" + dateMatch[2].str() + "-" + dateMatch[3].str();
        }
        return {};
    }

    std::string YieldXmlParser::ExtractTrayIdFromPath(const std::string& filePath)
    {
        
        size_t lastSlash = filePath.find_last_of("\\/");
        std::string filename = (lastSlash != std::string::npos)
            ? filePath.substr(lastSlash + 1)
            : filePath;

        
        size_t lastDot = filename.find_last_of('.');
        return (lastDot != std::string::npos)
            ? filename.substr(0, lastDot)
            : filename;
    }
