#include "../include/services/LogAnalyzerCommands.h"
#include "../include/utilities/FileUtils.h"
#include "../../third_party/json/json.hpp"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>
#include <map>
#include <regex>
#include <windows.h>

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace LogAnalyzer
{
    // Convert wide string to UTF-8 string
    std::string WStringToString(const std::wstring& wstr)
    {
        if (wstr.empty()) return std::string();

        int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
        return strTo;
    }

    // Convert UTF-8 string to wide string
    std::wstring StringToWString(const std::string& str)
    {
        if (str.empty()) return std::wstring();

        int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
        std::wstring wstrTo(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
        return wstrTo;
    }

    // Build hierarchical file tree recursively
    json BuildFileTree(const std::wstring& rootPath, const std::wstring& relativePath)
    {
        json result = json::array();

        try
        {
            std::wstring fullPath = relativePath.empty() ? rootPath : rootPath + L"\\" + relativePath;

            // Check if path exists and is a directory
            if (!fs::exists(fullPath) || !fs::is_directory(fullPath))
            {
                return result;
            }

            // Iterate through directory entries
            for (const auto& entry : fs::directory_iterator(fullPath))
            {
                try
                {
                    json node;

                    std::wstring name = entry.path().filename().wstring();
                    std::wstring path = relativePath.empty() ? name : relativePath + L"\\" + name;

                    node["name"] = WStringToString(name);
                    node["path"] = WStringToString(path);
                    node["isDirectory"] = entry.is_directory();

                    if (entry.is_regular_file())
                    {
                        // Get file size
                        node["size"] = entry.file_size();

                        // Get last modified time
                        auto ftime = fs::last_write_time(entry);
                        auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                            ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now()
                        );
                        auto time = std::chrono::system_clock::to_time_t(sctp);

                        char timeStr[100];
                        struct tm timeinfo;
                        localtime_s(&timeinfo, &time);
                        strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", &timeinfo);
                        node["modifiedDate"] = timeStr;
                    }
                    else if (entry.is_directory())
                    {
                        // Recursively build children
                        node["children"] = BuildFileTree(rootPath, path);
                    }

                    result.push_back(node);
                }
                catch (const std::exception&)
                {
                    // Skip files that can't be accessed
                    continue;
                }
            }
        }
        catch (const std::exception&)
        {
            // Return empty array on error
        }

        return result;
    }

    // Handle GetLogFileContent command
    std::string HandleGetLogFileContent(const std::string& commandData)
    {
        try
        {
            json cmdJson = json::parse(commandData);
            std::string filePath = cmdJson["FilePath"];

            // Convert to wide string for Windows file operations
            std::wstring wFilePath = StringToWString(filePath);

            // Open file
            std::ifstream file(wFilePath, std::ios::binary);
            if (!file.is_open())
            {
                json error;
                error["success"] = false;
                error["error"] = "Failed to open file: " + filePath;
                return error.dump();
            }

            // Get file size
            file.seekg(0, std::ios::end);
            size_t fileSize = file.tellg();
            file.seekg(0, std::ios::beg);

            // Read content
            std::string content;
            content.resize(fileSize);
            file.read(&content[0], fileSize);
            file.close();

            // Build result
            json result;
            result["success"] = true;
            result["content"] = content;
            result["size"] = fileSize;
            result["encoding"] = "UTF-8";

            return result.dump();
        }
        catch (const std::exception& ex)
        {
            json error;
            error["success"] = false;
            error["error"] = ex.what();
            return error.dump();
        }
    }
}