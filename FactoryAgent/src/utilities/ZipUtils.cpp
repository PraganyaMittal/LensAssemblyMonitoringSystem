#include "../include/utilities/ZipUtils.h"
#include "../include/utilities/FileUtils.h"

bool ZipUtils::ExtractZip(const std::string& zipPath, const std::string& destinationPath) {
    if (!FileUtils::FileExists(zipPath)) {
        return false;
    }

    if (!FileUtils::FolderExists(destinationPath)) {
        FileUtils::CreateFolder(destinationPath);
    }

    std::string cmd = "powershell.exe -NoProfile -Command \"Expand-Archive -Path '" +
        zipPath + "' -DestinationPath '" + destinationPath + "' -Force\"";

    int result = system(cmd.c_str());
    return (result == 0);
}

bool ZipUtils::CreateZip(const std::string& folderPath, const std::string& zipPath) {
    if (!FileUtils::FolderExists(folderPath)) {
        return false;
    }

    if (FileUtils::FileExists(zipPath)) {
        FileUtils::DeleteFile(zipPath);
    }

    
    
    std::string sourcePath = folderPath;
    if (sourcePath.back() == '\\') {
        sourcePath.pop_back();
    }
    sourcePath += "\\*";

    
    std::string cmd = "powershell.exe -NoProfile -Command \"Compress-Archive -Path '" +
        sourcePath + "' -DestinationPath '" + zipPath + "' -Force\"";

    int result = system(cmd.c_str());

    
    return (result == 0 && FileUtils::FileExists(zipPath));
}