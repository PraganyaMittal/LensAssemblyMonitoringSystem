#pragma once

#include "common/Types.h"
#include <nlohmann/json.hpp>
#include <vector>
#include <string>

using json = nlohmann::json;

class RestClient;


class ImageUploadService {
public:
    ImageUploadService(AgentSettings* settings, RestClient* client);
    ~ImageUploadService();

    ImageUploadService(const ImageUploadService&) = delete;
    ImageUploadService& operator=(const ImageUploadService&) = delete;

    
    void UploadInspectionImages(const std::string& imagePath, const std::string& requestId);

    
    void PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent);

private:
    AgentSettings* settings_;
    RestClient* httpClient_;

    // Max BMP file size to load for thumbnail generation (50 MB).
    static constexpr size_t MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024;

    std::string GenerateThumbnail(const std::string& bmpPath, int thumbWidth = 400, int thumbHeight = 300);
};
