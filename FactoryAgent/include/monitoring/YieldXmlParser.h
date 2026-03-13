#pragma once

#include "YieldTypes.h"
#include <string>

namespace Yield {

    /**
     * YieldXmlParser — stateless XML parsing utility.
     *
     * All methods are static.  No file I/O, no network, no side-effects.
     * This makes the parser trivially unit-testable.
     */
    class YieldXmlParser {
    public:
        /**
         * Parse raw XML content and extract yield data.
         * @param xmlContent   The full XML file content as a string.
         * @param result       [out] Populated with good/total counts, trayId, and yieldPercentage.
         * @return true if parsing succeeded and at least one bin was found.
         */
        static bool Parse(const std::string& xmlContent, YieldResult& result);

        /**
         * Extract a date string ("YYYY-MM-DD") from a file path.
         * Expects path segments like  .../2026/03/12/...
         * @return Date string or empty string if no date pattern found.
         */
        static std::string ExtractDateFromPath(const std::string& filePath);

        /**
         * Extract the filename stem (without extension) from a file path.
         * e.g., "C:/data/Lens_Tray1.xml" → "Lens_Tray1"
         */
        static std::string ExtractTrayIdFromPath(const std::string& filePath);

    private:
        YieldXmlParser() = delete; // Prevent instantiation
    };

} // namespace Yield
