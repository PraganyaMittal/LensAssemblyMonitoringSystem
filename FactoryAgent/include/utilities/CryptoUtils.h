#pragma once

#include <string>

class CryptoUtils {
public:
    // Compute SHA-256 hash of a file using BCrypt (modern Windows API).
    // Returns lowercase hex string, or empty string on failure.
    static std::string ComputeFileSHA256(const std::string& filePath);
};
