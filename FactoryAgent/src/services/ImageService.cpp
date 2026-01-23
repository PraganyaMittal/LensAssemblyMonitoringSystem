#include "../include/services/ImageService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/GzipCompressor.h"
#include "../include/common/Constants.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <regex>
#include <thread>

// STB Image libraries (for thumbnail generation)
#include "../include/third_party/stb_image.h"
#include "../include/third_party/stb_image_write.h"
#include "../include/third_party/stb_image_resize2.h"

namespace fs = std::filesystem;

// Base64 encoding characters
static const std::string BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

// Base64 encode helper
static std::string Base64Encode(const std::vector<uint8_t>& data) {
    std::string result;
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

ImageService::ImageService(AgentSettings* settings, HttpClient* client) {
    settings_ = settings;
    httpClient_ = client;
}

ImageService::~ImageService() {
}

void ImageService::UploadInspectionImages(const std::string& imagePath, const std::string& requestId) {
    if (requestId.empty()) {
        return;
    }

    // Normalize path: convert forward slashes to backslashes for Windows
    std::string normalizedPath = imagePath;
    for (char& c : normalizedPath) {
        if (c == '/') c = '\\';
    }

    // Determine if imagePath is absolute (starts with drive letter) or relative
    // Absolute: C:\LAI\LAI-WorkData\... or starts with \\
    // Relative: ModelName\TrayId\BarrelId\InspectionName
    std::string fullPath;
    if ((normalizedPath.length() >= 2 && normalizedPath[1] == ':') || 
        (normalizedPath.length() >= 2 && normalizedPath[0] == '\\' && normalizedPath[1] == '\\')) {
        // Absolute path - use as-is
        fullPath = normalizedPath;
    } else {
        // Relative path - append to base (legacy behavior)
        std::string basePath = "C:\\LAI\\LAI-WorkData";
        fullPath = basePath + "\\" + normalizedPath;
    }

    // Find all BMP files in directory
    std::vector<std::string> bmpFiles = FindBmpFiles(fullPath);

    if (bmpFiles.empty()) {
        // Send empty response to complete the request
        json requestBody;
        requestBody["images"] = json::array();

        json response;
        std::wstring endpoint = L"/api/agent-legacy/uploadimage/" + 
            std::wstring(requestId.begin(), requestId.end());
        httpClient_->Post(endpoint, requestBody, response);
        return;
    }

    // Build JSON payload with images (NO COMPRESSION for testing)
    json imagesArray = json::array();

    for (const auto& filePath : bmpFiles) {
        std::vector<uint8_t> fileData = ReadFileBytes(filePath);
        if (fileData.empty()) continue;

        // Skip GZIP compression - directly encode to Base64
        std::string base64Data = Base64Encode(fileData);

        // Extract filename
        size_t lastSlash = filePath.find_last_of("\\/");
        std::string filename = (lastSlash != std::string::npos) 
            ? filePath.substr(lastSlash + 1) 
            : filePath;

        json imageObj;
        imageObj["data"] = base64Data;
        imageObj["filename"] = filename;
        imagesArray.push_back(imageObj);
    }

    // Send to server
    json requestBody;
    requestBody["images"] = imagesArray;

    json response;
    std::wstring endpoint = L"/api/agent-legacy/uploadimage/" + 
        std::wstring(requestId.begin(), requestId.end());
    httpClient_->Post(endpoint, requestBody, response);
}

std::vector<std::string> ImageService::FindBmpFiles(const std::string& directoryPath) {
    std::vector<std::string> bmpFiles;

    try {
        if (!fs::exists(directoryPath) || !fs::is_directory(directoryPath)) {
            return bmpFiles;
        }

        for (const auto& entry : fs::directory_iterator(directoryPath)) {
            if (entry.is_regular_file()) {
                std::string ext = entry.path().extension().string();
                // Case-insensitive comparison for .bmp
                if (ext == ".bmp" || ext == ".BMP") {
                    bmpFiles.push_back(entry.path().string());
                }
            }
        }
    }
    catch (const std::exception&) {
        // Return empty on error
    }

    return bmpFiles;
}

std::string ImageService::CompressAndEncode(const std::vector<uint8_t>& data) {
    if (data.empty()) return "";

    std::vector<uint8_t> compressed = GzipCompressor::CompressToGzip(data);
    if (compressed.empty()) return "";

    return Base64Encode(compressed);
}

std::vector<uint8_t> ImageService::ReadFileBytes(const std::string& filePath) {
    std::vector<uint8_t> result;

    try {
        std::ifstream file(filePath, std::ios::binary | std::ios::ate);
        if (!file.is_open()) return result;

        size_t fileSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);

        result.resize(fileSize);
        if (!file.read(reinterpret_cast<char*>(result.data()), fileSize)) {
            result.clear();
        }
    }
    catch (const std::exception&) {
        result.clear();
    }

    return result;
}

std::string ImageService::BuildFullPath(const std::string& imagePath) {
    // Normalize path: convert forward slashes to backslashes for Windows
    std::string normalizedPath = imagePath;
    for (char& c : normalizedPath) {
        if (c == '/') c = '\\';
    }

    // Determine if imagePath is absolute (starts with drive letter) or relative
    if ((normalizedPath.length() >= 2 && normalizedPath[1] == ':') || 
        (normalizedPath.length() >= 2 && normalizedPath[0] == '\\' && normalizedPath[1] == '\\')) {
        return normalizedPath;
    } else {
        std::string basePath = "C:\\LAI\\LAI-WorkData";
        return basePath + "\\" + normalizedPath;
    }
}

std::string ImageService::GenerateThumbnail(const std::string& bmpPath, int thumbWidth, int thumbHeight) {
    // Default: 400x300 for 2x retina quality (displays at 200x150 with CSS scaling)
    // Load image using stb_image
    int width, height, channels;
    unsigned char* imgData = stbi_load(bmpPath.c_str(), &width, &height, &channels, 3); // Force RGB
    
    if (!imgData) {
        return "";
    }

    // Allocate buffer for resized image
    std::vector<unsigned char> resizedData(thumbWidth * thumbHeight * 3);
    
    // Resize using stb_image_resize2
    stbir_resize_uint8_linear(
        imgData, width, height, 0,
        resizedData.data(), thumbWidth, thumbHeight, 0,
        STBIR_RGB
    );
    
    // Free original image data
    stbi_image_free(imgData);
    
    // Encode to JPEG in memory using callback
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
        3,  // RGB components
        resizedData.data(),
        85  // quality
    );
    
    if (result == 0 || jpegBuffer.empty()) {
        return "";
    }
    
    // Convert to base64
    return Base64Encode(jpegBuffer);
}

void ImageService::PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent) {
    // Parse log content for NGImage entries
    std::vector<std::pair<std::string, std::string>> ngImageEntries; // (operationName, imagePath)
    
    std::istringstream stream(logContent);
    std::string line;
    
    while (std::getline(stream, line)) {
        // Split by tab
        std::vector<std::string> parts;
        std::istringstream lineStream(line);
        std::string part;
        while (std::getline(lineStream, part, '\t')) {
            parts.push_back(part);
        }
        
        if (parts.size() < 11) continue;
        
        std::string logType = parts[7];
        std::string operationName = parts[8];
        std::string jsonStr = parts[10];
        
        if (logType != "NGImage") continue;
        
        // Parse JSON to get imagePath
        try {
            json data = json::parse(jsonStr);
            if (data.contains("imagePath")) {
                std::string imagePath = data["imagePath"].get<std::string>();
                ngImageEntries.push_back({operationName, imagePath});
            }
        } catch (...) {
            continue;
        }
    }
    
    if (ngImageEntries.empty()) {
        return;
    }
    
    // Extract filename from path for cache key (more consistent than hash)
    size_t lastSlash = logFilePath.find_last_of("\\/");
    std::string logFileName = (lastSlash != std::string::npos) 
        ? logFilePath.substr(lastSlash + 1) 
        : logFilePath;
    
    // Build thumbnails array
    json thumbnailsArray = json::array();
    
    for (const auto& entry : ngImageEntries) {
        const std::string& operationName = entry.first;
        const std::string& imagePath = entry.second;
        
        std::string fullPath = BuildFullPath(imagePath);
        std::vector<std::string> bmpFiles = FindBmpFiles(fullPath);
        
        for (const auto& bmpPath : bmpFiles) {
            std::string thumbnailData = GenerateThumbnail(bmpPath);
            if (thumbnailData.empty()) continue;
            
            // Extract filename
            size_t lastSlash = bmpPath.find_last_of("\\/");
            std::string filename = (lastSlash != std::string::npos) 
                ? bmpPath.substr(lastSlash + 1) 
                : bmpPath;
            
            json thumbObj;
            thumbObj["operationName"] = operationName;
            thumbObj["imagePath"] = imagePath;
            thumbObj["filename"] = filename;
            thumbObj["data"] = thumbnailData;
            thumbnailsArray.push_back(thumbObj);
        }
    }
    
    if (thumbnailsArray.empty()) {
        return;
    }
    
    // POST thumbnails to server
    json requestBody;
    requestBody["logFileName"] = logFileName;
    requestBody["thumbnails"] = thumbnailsArray;
    
    json response;
    std::wstring endpoint = L"/api/thumbnail/upload";
    httpClient_->Post(endpoint, requestBody, response);
}
