#include "utilities/FileUtils.h"
#include <windows.h>
#include <fstream>
#include <sstream>
#include <sys/stat.h>
#include <shlobj.h>

bool FileUtils::FileExists(const std::string& filePath) {
    struct stat buffer;
    return (stat(filePath.c_str(), &buffer) == 0);
}

bool FileUtils::FolderExists(const std::string& folderPath) {
    DWORD attribs = GetFileAttributesA(folderPath.c_str());
    return (attribs != INVALID_FILE_ATTRIBUTES && (attribs & FILE_ATTRIBUTE_DIRECTORY));
}

bool FileUtils::CreateFolder(const std::string& folderPath) {
    int result = SHCreateDirectoryExA(NULL, folderPath.c_str(), NULL);
    return (result == ERROR_SUCCESS || result == ERROR_ALREADY_EXISTS);
}

bool FileUtils::DeleteFolder(const std::string& folderPath) {
    if (!FolderExists(folderPath)) {
        return false;
    }

    std::string cmd = "powershell.exe -NoProfile -Command \"Remove-Item -Path '" + folderPath + "' -Recurse -Force\"";
    int result = system(cmd.c_str());
    return (result == 0);
}

bool FileUtils::DeleteFile(const std::string& filePath) {
    return DeleteFileA(filePath.c_str()) != 0;
}

bool FileUtils::ReadFileContent(const std::string& filePath, std::string& content) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    content = buffer.str();
    file.close();

    return true;
}

bool FileUtils::WriteFileContent(const std::string& filePath, const std::string& content) {
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }

    file << content;
    file.close();

    return true;
}

std::string FileUtils::GetFileName(const std::string& filePath) {
    size_t pos = filePath.find_last_of("\\/");
    if (pos != std::string::npos) {
        return filePath.substr(pos + 1);
    }
    return filePath;
}

std::string FileUtils::GetFileExtension(const std::string& filePath) {
    size_t pos = filePath.find_last_of(".");
    if (pos != std::string::npos) {
        return filePath.substr(pos);
    }
    return "";
}

bool FileUtils::CopyFolderContents(const std::string& srcFolder, const std::string& dstFolder) {
    
    if (!CreateFolder(dstFolder)) {
        return false;
    }

    std::string searchPath = srcFolder;
    
    if (!searchPath.empty() && searchPath.back() != '\\' && searchPath.back() != '/') {
        searchPath += "\\";
    }
    std::string searchPattern = searchPath + "*";

    WIN32_FIND_DATAA findData;
    HANDLE hFind = FindFirstFileA(searchPattern.c_str(), &findData);
    if (hFind == INVALID_HANDLE_VALUE) {
        return false;
    }

    bool success = true;
    do {
        std::string name(findData.cFileName);
        if (name == "." || name == "..") {
            continue;
        }

        std::string srcPath = searchPath + name;
        std::string dstPath = dstFolder;
        if (!dstPath.empty() && dstPath.back() != '\\' && dstPath.back() != '/') {
            dstPath += "\\";
        }
        dstPath += name;

        if (findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            
            if (!CopyFolderContents(srcPath, dstPath)) {
                success = false;
                break;
            }
        }
        else {
            
            if (!CopyFileA(srcPath.c_str(), dstPath.c_str(), FALSE)) {
                success = false;
                break;
            }
        }
    } while (FindNextFileA(hFind, &findData));

    FindClose(hFind);
    return success;
}