#ifndef STRING_UTILS_H
#define STRING_UTILS_H



#include <string>
#include <vector>

class StringUtils {
public:
    static std::string Trim(const std::string& str);
    static std::string TrimLeft(const std::string& str);
    static std::string TrimRight(const std::string& str);
    static std::string ToLower(const std::string& str);
    static std::string ToUpper(const std::string& str);
    static bool StartsWith(const std::string& str, const std::string& prefix);
    static bool EndsWith(const std::string& str, const std::string& suffix);
    static std::vector<std::string> Split(const std::string& str, char delimiter);
    static std::string Replace(const std::string& str, const std::string& from, const std::string& to);

private:
    StringUtils();
};

#endif