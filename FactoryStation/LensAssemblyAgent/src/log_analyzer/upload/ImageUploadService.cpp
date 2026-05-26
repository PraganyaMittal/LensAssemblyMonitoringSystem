#include "log_analyzer/upload/ImageUploadService.h"
#include "network/RestClient.h"
#include "utilities/GzipCompressor.h"
#include "common/Constants.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>

// stb libraries for in-memory image processing
#include "third_party/stb_image.h"
#include "third_party/stb_image_write.h"
#include "third_party/stb_image_resize2.h"

namespace fs = std::filesystem;


static const std::string BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";


static std::string Base64Encode(const std::vector<uint8_t>& data) {
    std::string result;
    result.reserve(4 * data.size() / 3 + 4);

    int i = 0;
    unsigned char char_array_3[3];
    unsigned char char_array_4[4];
    size_t in_len = data.size();
    const uint8_t* bytes_to_encode = data.data();

    while (in_len--) {
        char_array_3[i++] = *(bytes_to_encode++);
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;

            for (i = 0; i < 4; i++)
                result += BASE64_CHARS[char_array_4[i]];
            i = 0;
        }
    }

    if (i) {
        for (int j = i; j < 3; j++)
            char_array_3[j] = '\0';

        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);

        for (int j = 0; j < i + 1; j++)
            result += BASE64_CHARS[char_array_4[j]];

        while (i++ < 3)
            result += '=';
    }

    return result;
}

ImageUploadService::ImageUploadService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}

ImageUploadService::~ImageUploadService() {
}

void ImageUploadService::UploadInspectionImages(const std::string& imagePath, const std::string& requestId) {
    if (requestId.empty()) {
        Logger::Warning("[ImageUploadService] UploadInspectionImages called with empty requestId");
        return;
    }

    Logger::Info("[ImageUploadService] UPLOAD_IMAGE request: " + imagePath);

    std::vector<std::string> bmpFiles;
    if (fs::exists(imagePath) && fs::is_regular_file(imagePath)) {
        bmpFiles.push_back(imagePath);
    } else {
        Logger::Warning("[ImageUploadService] File NOT FOUND: " + imagePath);
    }

    if (bmpFiles.empty()) {
        json requestBody;
        json response;
        std::wstring endpoint = L"/api/thumbnail/upload-binary/" + 
            NetworkUtils::ConvertStringToWString(requestId);
            
        bool success = httpClient_->Post(endpoint, requestBody, response);
        if (!success) {
            Logger::Warning("[ImageUploadService] Failed to send empty-image signal for request " + requestId);
        }
        return;
    }
    
    Logger::Info("[ImageUploadService] Uploading " + std::to_string(bmpFiles.size()) + " files...");

    json response;
    std::wstring endpoint = L"/api/thumbnail/upload-binary/" + 
        NetworkUtils::ConvertStringToWString(requestId);
    
    if (!httpClient_->UploadFiles(endpoint, bmpFiles, response)) {
        Logger::Error("[ImageUploadService] UploadFiles failed for request " + requestId);
    }
}



std::string ImageUploadService::GenerateThumbnail(const std::string& bmpPath, int thumbWidth, int thumbHeight) {
    // Guard against huge files — prevent OOM
    try {
        auto fileSize = fs::file_size(bmpPath);
        if (fileSize > MAX_IMAGE_FILE_SIZE) {
            Logger::Warning("[ImageUploadService] Skipping oversized image (" + 
                std::to_string(fileSize / (1024 * 1024)) + " MB): " + bmpPath);
            return "";
        }
    } catch (const std::exception& e) {
        Logger::Warning("[ImageUploadService] Cannot stat file " + bmpPath + ": " + e.what());
        return "";
    }

    int width, height, channels;
    unsigned char* imgData = stbi_load(bmpPath.c_str(), &width, &height, &channels, 3);
    
    if (!imgData) {
        Logger::Warning("[ImageUploadService] stbi_load failed for: " + bmpPath);
        return "";
    }

    // Resize to thumbnail dimensions
    std::vector<unsigned char> resizedData(thumbWidth * thumbHeight * 3);
    
    stbir_resize_uint8_linear(
        imgData, width, height, 0,
        resizedData.data(), thumbWidth, thumbHeight, 0,
        STBIR_RGB
    );
    
    stbi_image_free(imgData);
    
    // Encode resized image as JPEG in memory
    std::vector<uint8_t> jpegBuffer;
    auto writeCallback = [](void* context, void* data, int size) {
        std::vector<uint8_t>* buffer = static_cast<std::vector<uint8_t>*>(context);
        uint8_t* bytes = static_cast<uint8_t*>(data);
        buffer->insert(buffer->end(), bytes, bytes + size);
    };
    
    int result = stbi_write_jpg_to_func(
        writeCallback,
        &jpegBuffer,
        thumbWidth,
        thumbHeight,
        3,
        resizedData.data(),
        85  // JPEG quality
    );
    
    if (result == 0 || jpegBuffer.empty()) {
        Logger::Warning("[ImageUploadService] JPEG encoding failed for: " + bmpPath);
        return "";
    }
    
    return Base64Encode(jpegBuffer);
}

void ImageUploadService::PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent) {
    // Parse log content for NG (SET) entries containing ngPath
    struct NgEntry {
        std::string operationName;
        std::string imagePath;
        std::string barrelTrayId;
        std::string counterId;
        std::string counterType;
    };
    std::vector<NgEntry> ngImageEntries;
    
    std::istringstream stream(logContent);
    std::string line;
    
    while (std::getline(stream, line)) {
        std::vector<std::string> parts;
        std::istringstream lineStream(line);
        std::string part;
        while (std::getline(lineStream, part, '\t')) {
            parts.push_back(part);
        }
        
        if (parts.size() < 11) continue;
        
        std::string scope = parts[7];
        std::string operationName = parts[8];
        std::string eventType = parts[9];
        std::string jsonStr = parts[10];
        
        // New format: NG events are Seq_Log_Analyzer scope with SET event type
        if (scope != "Seq_Log_Analyzer") continue;
        if (eventType != "SET") continue;
        
        try {
            json data = json::parse(jsonStr);
            // New format uses "ngPath" instead of old "imagePath"
            if (data.contains("ngPath")) {
                std::string imagePath = data["ngPath"].get<std::string>();
                Logger::Info("[ImageUploadService] Parsed NG image path: " + imagePath);

                // Extract barrel/tray context for thumbnail scoping
                std::string barrelTrayId = "";
                std::string counterIdStr = "";
                std::string counterTypeStr = "";
                if (data.contains("barrelTrayId") && data["barrelTrayId"].is_string())
                    barrelTrayId = data["barrelTrayId"].get<std::string>();
                if (data.contains("barrelId") && data["barrelId"].is_number()) {
                    counterIdStr = std::to_string(data["barrelId"].get<int>());
                    counterTypeStr = "barrelId";
                } else if (data.contains("lensId") && data["lensId"].is_number()) {
                    counterIdStr = std::to_string(data["lensId"].get<int>());
                    counterTypeStr = "lensId";
                } else if (data.contains("spacerId") && data["spacerId"].is_number()) {
                    counterIdStr = std::to_string(data["spacerId"].get<int>());
                    counterTypeStr = "spacerId";
                }

                ngImageEntries.push_back({operationName, imagePath, barrelTrayId, counterIdStr, counterTypeStr});
            }
        } catch (const std::exception& e) {
            Logger::Warning("[ImageUploadService] JSON parse error: " + std::string(e.what()) + " — " + jsonStr);
            continue;
        }
    }
    
    if (ngImageEntries.empty()) {
        Logger::Info("[ImageUploadService] No NG image entries found in log.");
        return;
    }
    
    // Extract log file name from path
    size_t logLastSlash = logFilePath.find_last_of("\\/");
    std::string logFileName = (logLastSlash != std::string::npos) 
        ? logFilePath.substr(logLastSlash + 1) 
        : logFilePath;
    
    // Generate thumbnails for each NG image
    json thumbnailsArray = json::array();
    
    for (const auto& entry : ngImageEntries) {
        const std::string& operationName = entry.operationName;
        const std::string& imagePath = entry.imagePath;
        
        Logger::Info("[ImageUploadService] Processing image: " + imagePath);
        
        if (!fs::exists(imagePath) || !fs::is_regular_file(imagePath)) {
            Logger::Warning("[ImageUploadService] NG image file NOT FOUND: " + imagePath);
            continue;
        }

        std::string thumbnailData = GenerateThumbnail(imagePath);
        if (thumbnailData.empty()) {
            continue;
        }
        
        // Extract filename from the BMP path
        size_t bmpLastSlash = imagePath.find_last_of("\\/");
        std::string filename = (bmpLastSlash != std::string::npos) 
            ? imagePath.substr(bmpLastSlash + 1) 
            : imagePath;
        
        json thumbObj;
        thumbObj["operationName"] = operationName;
        thumbObj["ngPath"] = imagePath;
        thumbObj["filename"] = filename;
        thumbObj["data"] = thumbnailData;
        thumbObj["barrelTrayId"] = entry.barrelTrayId;
        thumbObj["counterId"] = entry.counterId;
        thumbObj["counterType"] = entry.counterType;
        thumbnailsArray.push_back(thumbObj);
    }
    
    if (thumbnailsArray.empty()) {
        return;
    }
    
    // POST all thumbnails to server
    json requestBody;
    requestBody["logFileName"] = logFileName;
    requestBody["thumbnails"] = thumbnailsArray;
    
    json response;
    std::wstring endpoint = L"/api/thumbnail/upload";
    if (!httpClient_->Post(endpoint, requestBody, response)) {
        Logger::Warning("[ImageUploadService] Failed to push thumbnails for log: " + logFileName);
    }
}
