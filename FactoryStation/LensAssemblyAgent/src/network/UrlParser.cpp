#include "network/UrlParser.h"
#include "common/Constants.h"

ParsedUrl UrlParser::Parse(const std::wstring& url) {
    ParsedUrl result;
    if (url.empty()) return result;

    result.isValid = true;
    std::wstring processingUrl = url;

    
    size_t protocolEnd = processingUrl.find(AgentConstants::PROTOCOL_SEPARATOR);
    if (protocolEnd != std::wstring::npos) {
        result.scheme = processingUrl.substr(0, protocolEnd);
        result.isHttps = (result.scheme == AgentConstants::HTTPS_PROTOCOL);
        result.port = result.isHttps ? AgentConstants::DEFAULT_HTTPS_PORT : AgentConstants::DEFAULT_HTTP_PORT;
        processingUrl = processingUrl.substr(protocolEnd + 3);
    } else {
        result.isHttps = false; 
        result.port = AgentConstants::DEFAULT_HTTP_PORT;
    }

    
    size_t portStart = processingUrl.find(L":");
    size_t pathStart = processingUrl.find(L"/");

    if (portStart != std::wstring::npos && (pathStart == std::wstring::npos || portStart < pathStart)) {
        result.host = processingUrl.substr(0, portStart);
        size_t portEnd = (pathStart != std::wstring::npos) ? pathStart : processingUrl.length();
        result.port = _wtoi(processingUrl.substr(portStart + 1, portEnd - portStart - 1).c_str());
        
        if (pathStart != std::wstring::npos) {
            result.path = processingUrl.substr(pathStart);
        } else {
            result.path = L"/";
        }
    } else if (pathStart != std::wstring::npos) {
        result.host = processingUrl.substr(0, pathStart);
        result.path = processingUrl.substr(pathStart);
    } else {
        result.host = processingUrl;
        result.path = L"/";
    }

    return result;
}
