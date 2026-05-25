#pragma once

#include <string>

class CrashDumper {
public:
    
    static void Install(const std::string& dumpDir);

private:
    static std::string dumpDir_;
    static LONG WINAPI ExceptionFilter(EXCEPTION_POINTERS* exceptionInfo);
};
