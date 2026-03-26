#pragma once

#include <string>

struct ParsedUrl {
    std::wstring scheme;
    std::wstring host;
    int port = 0;
    std::wstring path;
    bool isHttps = false;
    bool isValid = false;
};

class UrlParser {
public:
    static ParsedUrl Parse(const std::wstring& url);
};
