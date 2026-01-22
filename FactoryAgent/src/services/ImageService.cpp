#include "../include/services/ImageService.h"
#include "../include/network/HttpClient.h"
#include "../include/utilities/GzipCompressor.h"
#include "../include/common/Constants.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <sstream>

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

    // Build full path: C:\LAI\LAI-WorkData\{imagePath}
    // imagePath format: modelName\trayId\barrelId\inspectionName
    std::string basePath = "C:\\LAI\\LAI-WorkData";
    std::string fullPath = basePath + "\\" + imagePath;

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

    // Build JSON payload with compressed images
    json imagesArray = json::array();

    for (const auto& filePath : bmpFiles) {
        std::vector<uint8_t> fileData = ReadFileBytes(filePath);
        if (fileData.empty()) continue;

        // Compress using GZIP
        std::vector<uint8_t> compressedData = GzipCompressor::CompressToGzip(fileData);
        if (compressedData.empty()) continue;

        // Encode to base64
        std::string base64Data = Base64Encode(compressedData);

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
