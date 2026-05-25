#ifndef NETWORK_UTILS_H
#define NETWORK_UTILS_H

#include <string>

struct ParsedUrl {
    std::wstring scheme;
    std::wstring host;
    int port = 0;
    std::wstring path;
    bool isHttps = false;
    bool isValid = false;
};

class NetworkUtils {
public:
    static std::string GetIPAddress();
    static std::string DetectIPAddress();
    static std::string ConvertWStringToString(const std::wstring& wstr);
    static std::wstring ConvertStringToWString(const std::string& str);
    static ParsedUrl ParseUrl(const std::wstring& url);

private:
    NetworkUtils();
};

#endif