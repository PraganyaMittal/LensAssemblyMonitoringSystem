#include "log_analyzer/upload/LogFileUploadService.h"
#include "network/RestClient.h"
#include "network/NetworkUtils.h"
#include "utilities/GzipCompressor.h"
#include "common/Constants.h"
#include <filesystem>
#include <fstream>
#include <cstring>
#include <memory>
#include <limits>
#include <string_view>
#include "core/Logger.h"

namespace fs = std::filesystem;

// ── Constructor ────────────────────────────────────────────────────────────

LogFileUploadService::LogFileUploadService(AgentSettings* settings, RestClient* client)
    : settings_(settings), httpClient_(client) {
}

// ── Public API ─────────────────────────────────────────────────────────────

void LogFileUploadService::UploadRequestedFile(const std::string& filePath, const std::string& requestId) {
    std::string fullPath = settings_->logFolderPath + "\\" + filePath;
    
    if (!fs::exists(fullPath)) {
        return;
    }

    size_t lastSlash = fullPath.find_last_of("\\/");
    std::string fileName = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;

    std::string pcIdStr = std::to_string(settings_->mcId);
    
    std::wstring endpoint;
    if (!requestId.empty()) {
        endpoint = L"/api/agent/uploadlog/" + NetworkUtils::ConvertStringToWString(requestId);
    } else {
        endpoint = AgentConstants::ENDPOINT_UPLOAD_LOG;
    }

    // Filtered upload: reads line-by-line (no 50MB allocation),
    // keeps only lines relevant for analysis graphs (~500KB from 40-50MB),
    // compresses via GZip, and uploads. This is the ONLY upload path.
    if (UploadFilteredFile(fullPath, fileName, endpoint, pcIdStr)) {
        return;
    }
    Logger::Error("[LogFileUploadService] Filtered upload failed for " + fullPath + " — aborting (no full-file fallback)");
}

// ── Filtered File Upload ───────────────────────────────────────────────────
// Reads the log file line-by-line using a fixed 64KB buffer (OOM-safe),
// filters for START/END/NG events with barrelId, compresses, and uploads.

bool LogFileUploadService::UploadFilteredFile(const std::string& fullPath, const std::string& fileName,
    const std::wstring& endpoint, const std::string& pcIdStr) {
    
    // Open the file as a text stream — NO full-file allocation.
    std::ifstream file(fullPath, std::ios::in);
    if (!file.is_open()) {
        return false;
    }

    // The filtered output buffer. For a typical 40-50MB log file,
    // only ~0.5-2% of lines match, so this will be ~200KB-1MB.
    std::string filteredContent;
    filteredContent.reserve(1024 * 1024);  // Pre-allocate 1MB to avoid reallocs

    size_t totalLines = 0;
    size_t keptLines = 0;

    // OOM Protection: Use istream::getline(char*, streamsize) with a FIXED buffer
    // instead of std::getline(ifstream, string).
    //
    // Why? std::getline dynamically grows the std::string until it finds '\n'.
    // If a log file is corrupted (e.g., binary data, missing newlines), it would
    // try to read the entire 50MB file into one string and OOM-crash the agent.
    //
    // istream::getline(char*, N) reads at most N-1 chars into the fixed buffer.
    // If a line exceeds N, it sets failbit — we detect this, clear() the state,
    // ignore() the rest of the corrupted line, and continue safely.
    constexpr std::streamsize MAX_LINE_LEN = 64 * 1024;  // 64KB — no valid log line exceeds this
    auto lineBuffer = std::make_unique<char[]>(MAX_LINE_LEN);

    while (true) {
        file.getline(lineBuffer.get(), MAX_LINE_LEN);

        if (file.eof() && file.gcount() == 0) break;  // Clean end of file

        totalLines++;

        if (file.fail() && !file.eof()) {
            // Line exceeded MAX_LINE_LEN — corrupted or binary data.
            // Clear the error state and skip the remainder of this line.
            file.clear();
            file.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            continue;
        }

        // gcount() includes the null terminator written by getline, so actual
        // line length is gcount() - 1. Zero-copy: work directly on the buffer.
        size_t lineLen = file.gcount() > 0 ? static_cast<size_t>(file.gcount() - 1) : 0;
        if (lineLen == 0) continue;
        const char* lineData = lineBuffer.get();

        // Fast rejection: lines with < 11 tab-separated columns are irrelevant.
        // Count tabs without splitting — much cheaper than a full split.
        int tabCount = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                tabCount++;
                if (tabCount >= 10) break;  // We need at least 11 columns (10 tabs)
            }
        }
        if (tabCount < 10) continue;

        // Extract column 9 (event) — the 10th tab-separated field (0-indexed = 9).
        // Walk through tabs to find the start/end of column 9.
        int currentTab = 0;
        size_t col9Start = 0;
        size_t col9End = 0;
        for (size_t i = 0; i < lineLen; i++) {
            if (lineData[i] == '\t') {
                currentTab++;
                if (currentTab == 9) {
                    col9Start = i + 1;
                } else if (currentTab == 10) {
                    col9End = i;
                    break;
                }
            }
        }
        if (col9End <= col9Start) continue;

        // Check if event is START, END, or NG — these are the only events the UI parser uses.
        size_t eventLen = col9End - col9Start;
        const char* eventPtr = lineData + col9Start;

        bool isRelevantEvent = false;
        if (eventLen == 5 && std::memcmp(eventPtr, "START", 5) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 3 && std::memcmp(eventPtr, "END", 3) == 0) {
            isRelevantEvent = true;
        } else if (eventLen == 2 && std::memcmp(eventPtr, "NG", 2) == 0) {
            isRelevantEvent = true;
        }
        if (!isRelevantEvent) continue;

        // Check if column 10 (JSON payload) contains "barrelId".
        // The UI parser skips any line where barrelId is missing from the JSON.
        // We do a simple substring search — no JSON parsing needed.
        size_t col10Start = col9End + 1;
        if (col10Start >= lineLen) continue;

        // Search for "barrelId" in the remaining portion (zero-copy via string_view)
        std::string_view remainder(lineData + col10Start, lineLen - col10Start);
        if (remainder.find("barrelId") == std::string_view::npos) continue;

        // This line passed all 3 checks — keep it.
        filteredContent.append(lineData, lineLen);
        filteredContent.push_back('\n');
        keptLines++;
    }
    file.close();

    Logger::Info("[LogFileUploadService] Filtered " + fullPath + ": " +
        std::to_string(keptLines) + "/" + std::to_string(totalLines) + " lines kept (" +
        std::to_string(filteredContent.size() / 1024) + " KB)");

    if (filteredContent.empty()) {
        // No relevant lines found — this is valid (empty log file or no barrel data yet).
        // Send an empty content so the UI shows "no data" properly.
        filteredContent = "";
    }

    // Compress the filtered content (typically ~500KB → ~50KB)
    std::vector<uint8_t> dataToCompress(filteredContent.begin(), filteredContent.end());
    size_t originalSize = filteredContent.size();

    // Free the filteredContent memory before compression to minimize peak RAM
    filteredContent.clear();
    filteredContent.shrink_to_fit();

    std::vector<uint8_t> compressedData = GzipCompressor::CompressToGzip(dataToCompress);

    // Free uncompressed data immediately
    dataToCompress.clear();
    dataToCompress.shrink_to_fit();

    if (compressedData.empty()) {
        return false;  // Compression failed
    }

    json response;
    return httpClient_->UploadCompressedData(endpoint, compressedData, fileName, pcIdStr, originalSize, response);
}
