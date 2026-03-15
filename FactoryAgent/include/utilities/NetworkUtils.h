#ifndef NETWORK_UTILS_H
#define NETWORK_UTILS_H



#include <string>

class NetworkUtils {
public:
    static std::string GetIPAddress();
    static std::string DetectIPAddress();
    static std::string ConvertWStringToString(const std::wstring& wstr);
    static std::wstring ConvertStringToWString(const std::string& str);

private:
    NetworkUtils();
};

#endif