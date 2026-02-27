#include "PipeClient.h"
#include "../Common/PipeProtocol.h"
#include <iostream>

#define AGENT_VERSION "V1.0"

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Factory Agent " << AGENT_VERSION << std::endl;
    std::cout << "========================================" << std::endl;

    PipeClient client;
    if (!client.Connect()) return 1;
    client.Run();
    return 0;
}
