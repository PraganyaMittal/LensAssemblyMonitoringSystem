#pragma once
#include <string>
#include <functional>

namespace FactoryAgent {
namespace Interfaces {

class IWebSocketClient {
public:
    virtual ~IWebSocketClient() = default;
    virtual void Connect(int mcId, std::function<void(std::string, std::string, std::string)> onCommandReceived) = 0;
    virtual void Stop() = 0;
};

} 
} 