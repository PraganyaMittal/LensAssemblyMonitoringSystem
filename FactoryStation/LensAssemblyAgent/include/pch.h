#pragma once

// Target Windows 10
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif

// Windows headers
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <winhttp.h>
#include <commctrl.h>

// C++ STL
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <map>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <optional>
#include <functional>
#include <algorithm>
#include <atomic>
#include <chrono>

// Third-party
#include <nlohmann/json.hpp>
#include <curl/curl.h>
