#ifndef IMAGE_UPLOAD_SERVICE_H
#define IMAGE_UPLOAD_SERVICE_H

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

    
    void UploadInspectionImages(const std::string& imagePath, const std::string& requestId);

    
    void PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent);

private:
    AgentSettings* settings_;
    RestClient* httpClient_;

    
    std::vector<std::string> FindBmpFiles(const std::string& directoryPath);

    
    std::string CompressAndEncode(const std::vector<uint8_t>& data);

    
    std::vector<uint8_t> ReadFileBytes(const std::string& filePath);

    
    std::string GenerateThumbnail(const std::string& bmpPath, int thumbWidth = 400, int thumbHeight = 300);

    
    std::string BuildFullPath(const std::string& imagePath);

    
    ImageUploadService(const ImageUploadService&);
    ImageUploadService& operator=(const ImageUploadService&);
};

#endif
