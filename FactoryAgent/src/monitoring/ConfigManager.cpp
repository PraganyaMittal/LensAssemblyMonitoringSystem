#include "../include/monitoring/ConfigManager.h"
#include "../include/utilities/FileUtils.h"
#include "../include/utilities/StringUtils.h"
#include <sstream>
#include <regex>
#include <chrono>
#include <iomanip>
#include <ctime>

ConfigManager::ConfigManager() {
}

ConfigManager::~ConfigManager() {
}

bool ConfigManager::LoadConfig(const std::string& configPath) {
    std::string content;
    if (!FileUtils::ReadFileContent(configPath, content)) {
        return false;
    }

    std::istringstream stream(content);
    std::string line;

    while (std::getline(stream, line)) {
        size_t pos = line.find('=');
        if (pos != std::string::npos) {
            std::string key = line.substr(0, pos);
            std::string value = line.substr(pos + 1);

            key = StringUtils::Trim(key);
            value = StringUtils::Trim(value);

            settings_[key] = value;
        }
    }

    return true;
}

bool ConfigManager::SaveConfig(const std::string& configPath) {
    std::ostringstream stream;

    std::map<std::string, std::string>::iterator it;
    for (it = settings_.begin(); it != settings_.end(); ++it) {
        stream << it->first << "=" << it->second << "\n";
    }

    return FileUtils::WriteFileContent(configPath, stream.str());
}

std::string ConfigManager::GetValue(const std::string& key) const {
    std::map<std::string, std::string>::const_iterator it = settings_.find(key);
    if (it != settings_.end()) {
        return it->second;
    }
    return "";
}

void ConfigManager::SetValue(const std::string& key, const std::string& value) {
    settings_[key] = value;
}

bool ConfigManager::ParseConfigFile(const std::string& filePath, std::string& content) {
    return FileUtils::ReadFileContent(filePath, content);
}

bool ConfigManager::WriteConfigFile(const std::string& filePath, const std::string& content) {
    return FileUtils::WriteFileContent(filePath, content);
}

std::string ConfigManager::GetCurrentModel(const std::string& configContent) {
    std::string lowerContent = StringUtils::ToLower(configContent);
    std::string sectionHeader = "[current_model]";
    
    // Find the [current_model] section (case-insensitive)
    size_t sectionStart = lowerContent.find(sectionHeader);
    if (sectionStart == std::string::npos) {
        return "";
    }
    
    // Find the end of [current_model] section (next section header or end of file)
    size_t sectionEnd = lowerContent.find("\n[", sectionStart + 1);
    if (sectionEnd == std::string::npos) {
        sectionEnd = configContent.length();
    }
    
    // Search for model= at the start of a line within this section (case-insensitive)
    // We search within lowerContent but extract from original configContent
    std::string targetKey = "model=";
    size_t currentPos = sectionStart;
    
    while (currentPos < sectionEnd) {
        size_t found = lowerContent.find(targetKey, currentPos);
        if (found == std::string::npos || found >= sectionEnd) break;
        
        // Ensure it's at the beginning of a line (after newline OR at start of section header)
        // Allow for optional leading spaces before the key
        size_t lineStart = lowerContent.find_last_of("\n", found);
        bool isAtStartOfLine = (lineStart == std::string::npos || lineStart < sectionStart) ? (found == sectionStart + sectionHeader.length()) : true;
        
        // More robust: check if characters between last \n and found are all whitespace
        bool onlyWhitespaceBefore = true;
        size_t checkStart = (lineStart == std::string::npos) ? 0 : lineStart + 1;
        for (size_t i = checkStart; i < found; ++i) {
            if (!std::isspace(static_cast<unsigned char>(configContent[i]))) {
                onlyWhitespaceBefore = false;
                break;
            }
        }

        // Also ensure it's not model_path=
        bool isModelPath = false;
        if (found + targetKey.length() < sectionEnd) {
            if (lowerContent.compare(found, 11, "model_path=") == 0) {
                isModelPath = true;
            }
        }

        if (onlyWhitespaceBefore && !isModelPath) {
            // Found it! Extract and return value from original content
            size_t valueStart = found + targetKey.length();
            size_t lineEnd = configContent.find_first_of("\r\n", valueStart);
            if (lineEnd == std::string::npos || lineEnd > sectionEnd) lineEnd = sectionEnd;
            
            return StringUtils::Trim(configContent.substr(valueStart, lineEnd - valueStart));
        }
        currentPos = found + 1;
    }
    
    return "";
}

bool ConfigManager::UpdateCurrentModel(std::string& configContent, const std::string& modelName, const std::string& modelPath) {
    std::string lowerContent = StringUtils::ToLower(configContent);
    std::string sectionHeader = "[current_model]";
    
    // 1. Ensure [current_model] section exists (case-insensitive)
    size_t sectionStart = lowerContent.find(sectionHeader);
    if (sectionStart == std::string::npos) {
        // Section not found, append it at the end
        if (!configContent.empty() && configContent.back() != '\n') {
            configContent += "\r\n";
        }
        configContent += "\r\n[current_model]\r\nmodel=" + modelName + "\r\nmodel_path=" + modelPath + "\r\nchange_time=\r\n";
        // Re-calculate since we changed the string
        lowerContent = StringUtils::ToLower(configContent);
        sectionStart = lowerContent.find(sectionHeader);
    }

    // 2. Find the end of [current_model] section (next section header or end of file)
    size_t sectionEnd = lowerContent.find("\n[", sectionStart + 1);
    if (sectionEnd == std::string::npos) {
        sectionEnd = configContent.length();
    }

    // Prepare change_time format: [YYYY/MM/DD] [HH:MM:SS:mmm]
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm now_tm;
    localtime_s(&now_tm, &now_c);

    std::stringstream timeStream;
    timeStream << "[" << (now_tm.tm_year + 1900) << "/"
        << std::setfill('0') << std::setw(2) << (now_tm.tm_mon + 1) << "/"
        << std::setw(2) << now_tm.tm_mday << "] ["
        << std::setw(2) << now_tm.tm_hour << ":"
        << std::setw(2) << now_tm.tm_min << ":"
        << std::setw(2) << now_tm.tm_sec << ":"
        << std::setw(3) << ms.count() << "]";
    std::string changeTime = timeStream.str();

    // Helper to update or insert a key=value pair within the section
    auto upsertKey = [&](const std::string& key, const std::string& newValue) {
        std::string lowerKey = StringUtils::ToLower(key) + "=";
        size_t keyPos = std::string::npos;

        // Search for lowerKey within lowerContent section bounds
        size_t currentPosInSec = sectionStart;
        while (currentPosInSec < sectionEnd) {
            size_t found = lowerContent.find(lowerKey, currentPosInSec);
            if (found == std::string::npos || found >= sectionEnd) break;

            // Ensure beginning of line (after opt whitespace)
            size_t lineStart = lowerContent.find_last_of("\n", found);
            size_t checkStart = (lineStart == std::string::npos) ? 0 : lineStart + 1;
            bool onlyWhitespaceBefore = true;
            for (size_t i = checkStart; i < found; ++i) {
                if (!std::isspace(static_cast<unsigned char>(configContent[i]))) {
                    onlyWhitespaceBefore = false;
                    break;
                }
            }
            
            // Avoid model_path if searching for model
            if (onlyWhitespaceBefore) {
                if (key == "model" && lowerContent.compare(found, 11, "model_path=") == 0) {
                    // Skip
                } else {
                    keyPos = found;
                    break;
                }
            }
            currentPosInSec = found + 1;
        }

        if (keyPos != std::string::npos) {
            // Found: Replace the old value
            size_t valueStart = keyPos + lowerKey.length();
            size_t lineEnd = configContent.find_first_of("\r\n", valueStart);
            if (lineEnd == std::string::npos || lineEnd > sectionEnd) lineEnd = sectionEnd;
            
            size_t oldLen = lineEnd - valueStart;
            configContent.replace(valueStart, oldLen, newValue);
            
            // Re-sync lowerContent and sectionEnd
            lowerContent = StringUtils::ToLower(configContent);
            sectionEnd = lowerContent.find("\n[", sectionStart + 1);
            if (sectionEnd == std::string::npos) sectionEnd = configContent.length();
        }
        else {
            // Not found: Append to the end of section
            std::string toAppend = key + "=" + newValue + "\r\n";
            // Insert before the next section OR at end
            if (sectionEnd < configContent.length() && configContent[sectionEnd] == '\n') {
                configContent.insert(sectionEnd, toAppend);
            } else if (sectionEnd < configContent.length()) {
                 configContent.insert(sectionEnd, toAppend);
            } else {
                if (!configContent.empty() && configContent.back() != '\n') {
                    configContent += "\r\n";
                }
                configContent += toAppend;
            }
            // Re-sync
            lowerContent = StringUtils::ToLower(configContent);
            sectionEnd = lowerContent.find("\n[", sectionStart + 1);
            if (sectionEnd == std::string::npos) sectionEnd = configContent.length();
        }
    };

    upsertKey("model", modelName);
    upsertKey("model_path", modelPath);
    upsertKey("change_time", changeTime);

    return true;
}