#include "core/ConfigManager.h"
#include "utilities/FileUtils.h"
#include "utilities/StringUtils.h"
#include <sstream>
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
            std::string key = StringUtils::Trim(line.substr(0, pos));
            std::string value = StringUtils::Trim(line.substr(pos + 1));
            settings_[key] = value;
        }
    }

    return true;
}

bool ConfigManager::SaveConfig(const std::string& configPath) {
    std::ostringstream stream;
    for (auto it = settings_.begin(); it != settings_.end(); ++it) {
        stream << it->first << "=" << it->second << "\n";
    }
    return FileUtils::WriteFileContent(configPath, stream.str());
}

std::string ConfigManager::GetValue(const std::string& key) const {
    auto it = settings_.find(key);
    return (it != settings_.end()) ? it->second : "";
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




static bool FindSection(const std::string& content, const std::string& sectionName,
                        size_t& outStart, size_t& outEnd) {
    std::string lower = StringUtils::ToLower(content);
    std::string target = StringUtils::ToLower(sectionName);

    outStart = lower.find(target);
    if (outStart == std::string::npos) return false;

    outEnd = lower.find("\n[", outStart + 1);
    if (outEnd == std::string::npos) outEnd = content.length();
    return true;
}


static std::string FindKeyInSection(const std::string& content, size_t secStart, size_t secEnd,
                                     const std::string& key) {
    std::string lower = StringUtils::ToLower(content);
    std::string lowerKey = StringUtils::ToLower(key) + "=";

    size_t pos = secStart;
    while (pos < secEnd) {
        size_t found = lower.find(lowerKey, pos);
        if (found == std::string::npos || found >= secEnd) break;

        
        size_t lineStart = lower.find_last_of("\n", found);
        size_t checkFrom = (lineStart == std::string::npos || lineStart < secStart) ? secStart : lineStart + 1;
        bool atLineStart = true;
        for (size_t i = checkFrom; i < found; ++i) {
            if (!std::isspace(static_cast<unsigned char>(content[i]))) { atLineStart = false; break; }
        }

        
        bool isLongerKey = (found + lowerKey.length() < secEnd) &&
                           std::isalpha(static_cast<unsigned char>(lower[found + lowerKey.length() - 1])) &&
                           lower.compare(found, lowerKey.length() + 4, lowerKey.substr(0, lowerKey.length()-1) + "_") == 0;

        if (atLineStart && !isLongerKey) {
            size_t valueStart = found + lowerKey.length();
            size_t lineEnd = content.find_first_of("\r\n", valueStart);
            if (lineEnd == std::string::npos || lineEnd > secEnd) lineEnd = secEnd;
            return StringUtils::Trim(content.substr(valueStart, lineEnd - valueStart));
        }
        pos = found + 1;
    }
    return "";
}


static void UpsertKeyInSection(std::string& content, size_t secStart, size_t& secEnd,
                                const std::string& key, const std::string& value) {
    std::string lower = StringUtils::ToLower(content);
    std::string lowerKey = StringUtils::ToLower(key) + "=";

    size_t pos = secStart;
    while (pos < secEnd) {
        size_t found = lower.find(lowerKey, pos);
        if (found == std::string::npos || found >= secEnd) break;

        size_t lineStart = lower.find_last_of("\n", found);
        size_t checkFrom = (lineStart == std::string::npos) ? 0 : lineStart + 1;
        bool atLineStart = true;
        for (size_t i = checkFrom; i < found; ++i) {
            if (!std::isspace(static_cast<unsigned char>(content[i]))) { atLineStart = false; break; }
        }

        
        if (key == "model" && lower.compare(found, 11, "model_path=") == 0) {
            pos = found + 1;
            continue;
        }

        if (atLineStart) {
            
            size_t valueStart = found + lowerKey.length();
            size_t lineEnd = content.find_first_of("\r\n", valueStart);
            if (lineEnd == std::string::npos || lineEnd > secEnd) lineEnd = secEnd;
            content.replace(valueStart, lineEnd - valueStart, value);
            
            lower = StringUtils::ToLower(content);
            secEnd = lower.find("\n[", secStart + 1);
            if (secEnd == std::string::npos) secEnd = content.length();
            return;
        }
        pos = found + 1;
    }

    
    std::string toAppend = key + "=" + value + "\r\n";
    if (secEnd < content.length()) {
        content.insert(secEnd, toAppend);
    } else {
        if (!content.empty() && content.back() != '\n') content += "\r\n";
        content += toAppend;
    }
    lower = StringUtils::ToLower(content);
    secEnd = lower.find("\n[", secStart + 1);
    if (secEnd == std::string::npos) secEnd = content.length();
}



std::string ConfigManager::GetCurrentModel(const std::string& configContent) {
    size_t secStart, secEnd;
    if (!FindSection(configContent, "[current_model]", secStart, secEnd)) return "";
    return FindKeyInSection(configContent, secStart, secEnd, "model");
}

bool ConfigManager::UpdateCurrentModel(std::string& configContent,
                                        const std::string& modelName,
                                        const std::string& modelPath) {
    size_t secStart, secEnd;
    if (!FindSection(configContent, "[current_model]", secStart, secEnd)) {
        
        if (!configContent.empty() && configContent.back() != '\n') configContent += "\r\n";
        configContent += "\r\n[current_model]\r\nmodel=" + modelName + "\r\nmodel_path=" + modelPath + "\r\nchange_time=\r\n";
        
        FindSection(configContent, "[current_model]", secStart, secEnd);
    }

    
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm now_tm;
    localtime_s(&now_tm, &now_c);

    std::stringstream ts;
    ts << "[" << (now_tm.tm_year + 1900) << "/"
       << std::setfill('0') << std::setw(2) << (now_tm.tm_mon + 1) << "/"
       << std::setw(2) << now_tm.tm_mday << "] ["
       << std::setw(2) << now_tm.tm_hour << ":"
       << std::setw(2) << now_tm.tm_min << ":"
       << std::setw(2) << now_tm.tm_sec << ":"
       << std::setw(3) << ms.count() << "]";

    UpsertKeyInSection(configContent, secStart, secEnd, "model", modelName);
    UpsertKeyInSection(configContent, secStart, secEnd, "model_path", modelPath);
    UpsertKeyInSection(configContent, secStart, secEnd, "change_time", ts.str());

    return true;
}