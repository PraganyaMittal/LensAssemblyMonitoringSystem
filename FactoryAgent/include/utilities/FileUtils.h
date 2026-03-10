#ifndef FILE_UTILS_H
#define FILE_UTILS_H

/*
 * FileUtils.h
 * File system utility functions
 */

#include <string>
#include <windows.h>

class FileUtils {
public:
    static bool FileExists(const std::string& filePath);
    static bool FolderExists(const std::string& folderPath);
    static bool CreateFolder(const std::string& folderPath);
    static bool DeleteFolder(const std::string& folderPath);
    static bool DeleteFile(const std::string& filePath);
    static bool ReadFileContent(const std::string& filePath, std::string& content);
    static bool WriteFileContent(const std::string& filePath, const std::string& content);
    static std::string GetFileName(const std::string& filePath);
    static std::string GetFileExtension(const std::string& filePath);

    // Copy all files and subdirectories from src folder to dst folder.
    // Used by UpdateBundle to copy component files to staging directories.
    static bool CopyFolderContents(const std::string& srcFolder, const std::string& dstFolder);

private:
    FileUtils();
};

#endif