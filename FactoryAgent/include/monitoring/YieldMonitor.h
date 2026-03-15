#pragma once

#include "YieldTypes.h"
#include "YieldFileWatcher.h"
#include "YieldReporter.h"
#include <string>
#include <memory>

namespace Yield { class YieldFileWatcher; class YieldReporter; }


class YieldMonitor {
public:
    YieldMonitor();
    ~YieldMonitor();

    void Initialize(const std::wstring& watchDirectory, int machineId,
                    const std::wstring& lineNum, const std::wstring& mcNum,
                    const std::wstring& serverUrl);
    void Start();
    void Stop();
    void UpdateMachineId(int machineId);

private:
    void OnFileReady(const std::wstring& filePath, const std::string& content);

    Yield::YieldConfig config_;
    std::unique_ptr<Yield::YieldFileWatcher> fileWatcher_;
    std::unique_ptr<Yield::YieldReporter>    reporter_;
};
