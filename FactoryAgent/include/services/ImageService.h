#ifndef IMAGE_SERVICE_H
#define IMAGE_SERVICE_H

#include "common/Types.h"
#include "json/json.hpp"
#include <vector>
#include <string>

using json = nlohmann::json;

class HttpClient;


class ImageService {
public:
    ImageService(AgentSettings* settings, HttpClient* client);
    ~ImageService();

    
    void UploadInspectionImages(const std::string& imagePath, const std::string& requestId);

    
    void PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent);

private:
    AgentSettings* settings_;
    HttpClient* httpClient_;

    
    std::vector<std::string> FindBmpFiles(const std::string& directoryPath);

    
    std::string CompressAndEncode(const std::vector<uint8_t>& data);

    
    std::vector<uint8_t> ReadFileBytes(const std::string& filePath);

    
    std::string GenerateThumbnail(const std::string& bmpPath, int thumbWidth = 400, int thumbHeight = 300);

    
    std::string BuildFullPath(const std::string& imagePath);

    
    ImageService(const ImageService&);
    ImageService& operator=(const ImageService&);
};

#endif
