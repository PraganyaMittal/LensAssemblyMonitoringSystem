#include "utilities/CryptoUtils.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <vector>
#include <windows.h>
#include <bcrypt.h>

#pragma comment(lib, "bcrypt.lib")

std::string CryptoUtils::ComputeFileSHA256(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) return "";

    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    std::string result;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";

    DWORD hashObjSize = 0, dataSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashObject(hashObjSize);
    DWORD hashSize = 0;
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashSize, sizeof(DWORD), &dataSize, 0);

    std::vector<UCHAR> hashValue(hashSize);

    if (BCryptCreateHash(hAlg, &hHash, hashObject.data(), hashObjSize, NULL, 0, 0) == 0) {
        char buffer[8192];
        while (file.read(buffer, sizeof(buffer)) || file.gcount() > 0) {
            BCryptHashData(hHash, (PUCHAR)buffer, (ULONG)file.gcount(), 0);
            if (file.eof()) break;
        }

        if (BCryptFinishHash(hHash, hashValue.data(), hashSize, 0) == 0) {
            std::ostringstream oss;
            for (DWORD i = 0; i < hashSize; i++) {
                oss << std::hex << std::setfill('0') << std::setw(2) << (int)hashValue[i];
            }
            result = oss.str();
        }
        BCryptDestroyHash(hHash);
    }

    BCryptCloseAlgorithmProvider(hAlg, 0);
    return result;
}
