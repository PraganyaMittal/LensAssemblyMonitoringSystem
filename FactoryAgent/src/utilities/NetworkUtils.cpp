#include "utilities/NetworkUtils.h"
#include "common/Constants.h"
#include <windows.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

std::string NetworkUtils::DetectIPAddress() {
    std::string ip = "127.0.0.1";
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) == 0) {
        ip = GetIPAddress();
        WSACleanup();
    }
    return ip;
}

std::string NetworkUtils::GetIPAddress() {
    char hostname[AgentConstants::MAX_HOSTNAME_LENGTH];
    if (gethostname(hostname, sizeof(hostname)) != 0) {
        return AgentConstants::DEFAULT_IP_ADDRESS;
    }

    struct addrinfo hints;
    ZeroMemory(&hints, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    struct addrinfo* result = NULL;
    if (getaddrinfo(hostname, NULL, &hints, &result) == 0) {
        char ip[AgentConstants::MAX_IP_LENGTH];
        struct sockaddr_in* addr = (struct sockaddr_in*)result->ai_addr;
        inet_ntop(AF_INET, &(addr->sin_addr), ip, AgentConstants::MAX_IP_LENGTH);
        freeaddrinfo(result);
        return std::string(ip);
    }

    return AgentConstants::DEFAULT_IP_ADDRESS;
}

std::string NetworkUtils::ConvertWStringToString(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

std::wstring NetworkUtils::ConvertStringToWString(const std::string& str) {
    if (str.empty()) return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}