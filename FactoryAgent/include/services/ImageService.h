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

    // Non-copyable
    ImageService(const ImageService&);
    ImageService& operator=(const ImageService&);
};

#endif
