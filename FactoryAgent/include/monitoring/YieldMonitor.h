#pragma once

#include "YieldTypes.h"
#include "YieldFileWatcher.h"
#include "YieldReporter.h"
#include <string>
#include <memory>

namespace Yield { class YieldFileWatcher; class YieldReporter; }

/**
 * YieldMonitor — thin orchestrator.
 *
 * Wires together YieldFileWatcher (file events), YieldXmlParser (parsing),
 * and YieldReporter (async upload).  The public interface is unchanged
 * from the original implementation so that AgentCore requires zero changes.
 */
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
