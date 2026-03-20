#include "services/ImageService.h"
#include "network/HttpClient.h"
#include "utilities/GzipCompressor.h"
#include "common/Constants.h"
#include "utilities/NetworkUtils.h"
#include "utilities/FileUtils.h" 
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <regex>
#include <thread>
#include <cstdio>


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

    
    std::string normalizedPath = imagePath;
    for (char& c : normalizedPath) {
        if (c == '/') c = '\\';
    }

    
    
    
    std::string fullPath;
    if ((normalizedPath.length() >= 2 && normalizedPath[1] == ':') || 
        (normalizedPath.length() >= 2 && normalizedPath[0] == '\\' && normalizedPath[1] == '\\')) {
        
        fullPath = normalizedPath;
    } else {
        
        std::string basePath = "C:\\LAI\\LAI-WorkData";
        fullPath = basePath + "\\" + normalizedPath;
    }

    
    
    
    std::vector<std::string> bmpFiles;
    
    
    bool isSingleFile = false;
    if (fullPath.length() > 4) {
        std::string ext = fullPath.substr(fullPath.length() - 4);
        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        if (ext == ".bmp") {
            isSingleFile = true;
        }
    }

    printf("[Agent] UPLOAD_IMAGE Request: %s\n", fullPath.c_str());

    if (isSingleFile) {
        if (fs::exists(fullPath) && fs::is_regular_file(fullPath)) {
             bmpFiles.push_back(fullPath);
        } else {
             printf("[Agent] File NOT FOUND: %s\n", fullPath.c_str());
        }
    } else {
        bmpFiles = FindBmpFiles(fullPath); 
    }
    
    if (bmpFiles.empty()) {
        printf("[Agent] No files to upload. Sending empty signal...\n");
        
        json requestBody;
        json response;
        std::wstring endpoint = L"/api/thumbnail/upload-binary/" + 
            NetworkUtils::ConvertStringToWString(requestId);
            
        bool success = httpClient_->Post(endpoint, requestBody, response);
        printf("[Agent] Empty Signal Sent? %s\n", success ? "YES" : "NO");
        return;
    }
    
    printf("[Agent] Uploading %zu files...\n", bmpFiles.size());

    
    json response;
    std::wstring endpoint = L"/api/thumbnail/upload-binary/" + 
        NetworkUtils::ConvertStringToWString(requestId);
    
    httpClient_->UploadFiles(endpoint, bmpFiles, response);
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
                
                if (ext == ".bmp" || ext == ".BMP") {
                    bmpFiles.push_back(entry.path().string());
                }
            }
        }
    }
    catch (const std::exception&) {
        
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
    
    std::string normalizedPath = imagePath;
    for (char& c : normalizedPath) {
        if (c == '/') c = '\\';
    }

    
    if ((normalizedPath.length() >= 2 && normalizedPath[1] == ':') || 
        (normalizedPath.length() >= 2 && normalizedPath[0] == '\\' && normalizedPath[1] == '\\')) {
        return normalizedPath;
    } else {
        std::string basePath = "C:\\LAI\\LAI-WorkData";
        return basePath + "\\" + normalizedPath;
    }
}

std::string ImageService::GenerateThumbnail(const std::string& bmpPath, int thumbWidth, int thumbHeight) {
    
    
    int width, height, channels;
    unsigned char* imgData = stbi_load(bmpPath.c_str(), &width, &height, &channels, 3); 
    
    if (!imgData) {
        return "";
    }

    
    std::vector<unsigned char> resizedData(thumbWidth * thumbHeight * 3);
    
    
    stbir_resize_uint8_linear(
        imgData, width, height, 0,
        resizedData.data(), thumbWidth, thumbHeight, 0,
        STBIR_RGB
    );
    
    
    stbi_image_free(imgData);
    
    
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
        85  
    );
    
    if (result == 0 || jpegBuffer.empty()) {
        return "";
    }
    
    
    return Base64Encode(jpegBuffer);
}

void ImageService::PushThumbnailsForLog(const std::string& logFilePath, const std::string& logContent) {
    
    std::vector<std::pair<std::string, std::string>> ngImageEntries; 
    
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
        
        std::string logType = parts[7];
        std::string operationName = parts[8];
        std::string jsonStr = parts[10];
        
        if (logType != "NGImage") continue;
        
        
        try {
            json data = json::parse(jsonStr);
            if (data.contains("imagePath")) {
                std::string imagePath = data["imagePath"].get<std::string>();
                printf("[Agent] Parsed NGImage Path: %s\n", imagePath.c_str());
                ngImageEntries.push_back({operationName, imagePath});
            } else {
                printf("[Agent] NGImage JSON missing imagePath: %s\n", jsonStr.c_str());
            }
        } catch (...) {
            printf("[Agent] JSON Parse Error: %s\n", jsonStr.c_str());
            continue;
        }
    }
    
    if (ngImageEntries.empty()) {
        printf("[Agent] No NGImage entries found in log.\n");
        return;
    }
    
    
    size_t lastSlash = logFilePath.find_last_of("\\/");
    std::string logFileName = (lastSlash != std::string::npos) 
        ? logFilePath.substr(lastSlash + 1) 
        : logFilePath;
    
    
    json thumbnailsArray = json::array();
    
    for (const auto& entry : ngImageEntries) {
        const std::string& operationName = entry.first;
        const std::string& imagePath = entry.second;
        
        std::string fullPath = BuildFullPath(imagePath);
        printf("[Agent] Scanning for BMPs in: %s\n", fullPath.c_str());
        
        std::vector<std::string> bmpFiles = FindBmpFiles(fullPath);
        printf("[Agent] Found %zu BMPs\n", bmpFiles.size());
        
        for (const auto& bmpPath : bmpFiles) {
            std::string thumbnailData = GenerateThumbnail(bmpPath);
            if (thumbnailData.empty()) {
                printf("[Agent] Failed to generate thumbnail for %s\n", bmpPath.c_str());
                continue;
            }
            
            
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
    
    
    json requestBody;
    requestBody["logFileName"] = logFileName;
    requestBody["thumbnails"] = thumbnailsArray;
    
    json response;
    std::wstring endpoint = L"/api/thumbnail/upload";
    httpClient_->Post(endpoint, requestBody, response);
}
