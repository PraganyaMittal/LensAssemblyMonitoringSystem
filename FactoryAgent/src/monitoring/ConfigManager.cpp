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
    // Find the [current_model] section first
    size_t sectionStart = configContent.find("[current_model]");
    if (sectionStart == std::string::npos) {
        return "";
    }
    
    // Find the end of [current_model] section (next section header or end of file)
    size_t sectionEnd = configContent.find("\n[", sectionStart + 1);
    if (sectionEnd == std::string::npos) {
        sectionEnd = configContent.length();
    }
    
    // Search for model= at the start of a line within this section
    // Using \nmodel= to ensure we match at line start (not model_path=)
    std::string searchKey = "\nmodel=";
    size_t keyPos = configContent.find(searchKey, sectionStart);
    
    // Make sure we found it within the section
    if (keyPos == std::string::npos || keyPos >= sectionEnd) {
        return "";
    }
    
    // Find position right after the '='
    size_t valueStart = keyPos + searchKey.length();
    
    // Find the end of the line (could be \r\n or \n or end of section)
    size_t lineEnd = valueStart;
    while (lineEnd < sectionEnd && configContent[lineEnd] != '\r' && configContent[lineEnd] != '\n') {
        lineEnd++;
    }
    
    // Extract and return the value
    std::string value = configContent.substr(valueStart, lineEnd - valueStart);
    return StringUtils::Trim(value);
}

bool ConfigManager::UpdateCurrentModel(std::string& configContent, const std::string& modelName, const std::string& modelPath) {
    // Find the [current_model] section and only modify values within it
    // This prevents accidentally modifying "model=" keys in other sections
    
    // Find the start of [current_model] section
    size_t sectionStart = configContent.find("[current_model]");
    if (sectionStart == std::string::npos) {
        return false;
    }
    
    // Find the end of [current_model] section (next section header or end of file)
    size_t sectionEnd = configContent.find("\n[", sectionStart + 1);
    if (sectionEnd == std::string::npos) {
        sectionEnd = configContent.length();
    }
    
    // Helper lambda to replace a value for a key within the section
    // Returns true if replacement was made
    auto replaceKeyValue = [&](const std::string& key, const std::string& newValue) -> bool {
        // Search for the key at the start of a line (after newline)
        // This prevents "model=" from matching inside "model_path="
        std::string searchKey = "\n" + key + "=";
        size_t keyPos = configContent.find(searchKey, sectionStart);
        
        // Make sure we found it within the section
        if (keyPos == std::string::npos || keyPos >= sectionEnd) {
            return false;
        }
        
        // Find position right after the '=' (skip the \n we added to search)
        size_t valueStart = keyPos + searchKey.length();
        
        // Find the end of the line (could be \r\n or \n or end of section)
        size_t lineEnd = valueStart;
        while (lineEnd < sectionEnd && configContent[lineEnd] != '\r' && configContent[lineEnd] != '\n') {
            lineEnd++;
        }
        
        // Calculate how much content we're removing vs adding
        size_t oldValueLen = lineEnd - valueStart;
        
        // Replace the old value with the new value
        configContent.replace(valueStart, oldValueLen, newValue);
        
        // Update sectionEnd since the content length changed
        sectionEnd = sectionEnd - oldValueLen + newValue.length();
        
        return true;
    };
    
    // 1. Replace model value
    replaceKeyValue("model", modelName);
    
    // 2. Replace model_path value
    replaceKeyValue("model_path", modelPath);
    
    // 3. Update change_time to format: [YYYY/MM/DD] [HH:MM:SS:mmm]
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm now_tm;

    // Use localtime_s for thread safety on Windows (since project uses windows.h)
    localtime_s(&now_tm, &now_c);

    std::stringstream timeStream;
    timeStream << "[" << (now_tm.tm_year + 1900) << "/"
        << std::setfill('0') << std::setw(2) << (now_tm.tm_mon + 1) << "/"
        << std::setw(2) << now_tm.tm_mday << "] ["
        << std::setw(2) << now_tm.tm_hour << ":"
        << std::setw(2) << now_tm.tm_min << ":"
        << std::setw(2) << now_tm.tm_sec << ":"
        << std::setw(3) << ms.count() << "]";

    replaceKeyValue("change_time", timeStream.str());

    return true;
}