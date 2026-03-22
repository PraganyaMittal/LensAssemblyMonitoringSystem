#include "utilities/CrashDumper.h"
#include "core/Logger.h"
#include <windows.h>
#include <dbghelp.h>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <filesystem>

#pragma comment(lib, "dbghelp.lib")

std::string CrashDumper::dumpDir_;

void CrashDumper::Install(const std::string& dumpDir) {
    dumpDir_ = dumpDir;

    // Ensure the crash dump directory exists
    std::filesystem::create_directories(dumpDir_);

    SetUnhandledExceptionFilter(ExceptionFilter);
    Logger::Info("CrashDumper installed. Dumps will be written to: " + dumpDir_);
}

LONG WINAPI CrashDumper::ExceptionFilter(EXCEPTION_POINTERS* exceptionInfo) {
    // Build filename with timestamp: crash_20260322_143021.dmp
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    std::tm tm_now;
    localtime_s(&tm_now, &time_t_now);

    std::ostringstream filename;
    filename << dumpDir_ << "\\crash_"
             << (tm_now.tm_year + 1900)
             << std::setfill('0') << std::setw(2) << (tm_now.tm_mon + 1)
             << std::setw(2) << tm_now.tm_mday << "_"
             << std::setw(2) << tm_now.tm_hour
             << std::setw(2) << tm_now.tm_min
             << std::setw(2) << tm_now.tm_sec
             << ".dmp";

    HANDLE hFile = CreateFileA(
        filename.str().c_str(),
        GENERIC_WRITE, 0, nullptr,
        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);

    if (hFile != INVALID_HANDLE_VALUE) {
        MINIDUMP_EXCEPTION_INFORMATION mei;
        mei.ThreadId = GetCurrentThreadId();
        mei.ExceptionPointers = exceptionInfo;
        mei.ClientPointers = FALSE;

        MiniDumpWriteDump(
            GetCurrentProcess(),
            GetCurrentProcessId(),
            hFile,
            MiniDumpWithDataSegs,
            &mei,
            nullptr,
            nullptr);

        CloseHandle(hFile);
    }

    return EXCEPTION_CONTINUE_SEARCH;
}
