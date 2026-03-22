#pragma once

#include <string>

// Installs a Windows unhandled exception filter that writes a minidump
// to the specified directory on crash. Call once at startup.
class CrashDumper {
public:
    // Install the crash handler. dumpDir: directory to write .dmp files to.
    static void Install(const std::string& dumpDir);

private:
    static std::string dumpDir_;
    static LONG WINAPI ExceptionFilter(EXCEPTION_POINTERS* exceptionInfo);
};
