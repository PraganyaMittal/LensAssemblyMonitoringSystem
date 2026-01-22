#ifndef IMAGE_SERVICE_H
#define IMAGE_SERVICE_H

#include "../common/Types.h"
#include "../../third_party/json/json.hpp"
#include <vector>
#include <string>

using json = nlohmann::json;

class HttpClient;

/**
 * ImageService handles uploading inspection images for NG (Not Good) operations.
 * 
 * When the server requests images via SignalR, this service:
 * 1. Locates BMP files in the specified inspection directory
 * 2. Compresses each image using GZIP
 * 3. Encodes to base64 and uploads to server
 */
class ImageService {
public:
    ImageService(AgentSettings* settings, HttpClient* client);
    ~ImageService();

    /**
     * Upload inspection images for a given NG operation.
     * 
     * @param imagePath Relative path: modelName\trayId\barrelId\inspectionName
     * @param requestId Correlation ID for the server request
     */
    void UploadInspectionImages(const std::string& imagePath, const std::string& requestId);

    /**
     * Generate and push thumbnails for all NGImage entries in a log file.
     * Called after log upload completes. Runs in background.
     * 
     * @param logFilePath Path to the log file (used as cache key)
     * @param logContent Content of the log file to parse for NGImage entries
     */
    void PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;

    /**
     * Find all BMP files in the specified directory.
     */
    std::vector<std::string> FindBmpFiles(const std::string& directoryPath);

    /**
     * Compress file data using GZIP and encode as base64.
     */
    std::string CompressAndEncode(const std::vector<uint8_t>& data);

    /**
     * Read file contents into byte vector.
     */
    std::vector<uint8_t> ReadFileBytes(const std::string& filePath);

    /**
     * Generate a JPEG thumbnail from a BMP file.
     * @param bmpPath Full path to the BMP file
     * @param thumbWidth Target thumbnail width (default 200)
     * @param thumbHeight Target thumbnail height (default 150)
     * @return Base64-encoded JPEG thumbnail data, or empty string on error
     */
    std::string GenerateThumbnail(const std::string& bmpPath, int thumbWidth = 200, int thumbHeight = 150);

    /**
     * Build full image path from relative path.
     */
    std::string BuildFullPath(const std::string& imagePath);

    // Non-copyable
    ImageService(const ImageService&);
    ImageService& operator=(const ImageService&);
};

#endif
