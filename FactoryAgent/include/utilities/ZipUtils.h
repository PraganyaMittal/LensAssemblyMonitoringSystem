#ifndef ZIP_UTILS_H
#define ZIP_UTILS_H



#include <string>

class ZipUtils {
public:
    static bool ExtractZip(const std::string& zipPath, const std::string& destinationPath);
    static bool CreateZip(const std::string& folderPath, const std::string& zipPath);

private:
    ZipUtils();
};

#endif