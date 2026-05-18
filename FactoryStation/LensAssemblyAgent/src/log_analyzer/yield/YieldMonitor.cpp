#include "log_analyzer/yield/YieldMonitor.h"
#include "log_analyzer/yield/YieldXmlParser.h"
#include "log_analyzer/yield/YieldFileWatcher.h"
#include "log_analyzer/yield/YieldReporter.h"
#include "network/NetworkUtils.h"
#include "core/Logger.h"

YieldMonitor::YieldMonitor()
    : fileWatcher_(std::make_unique<YieldFileWatcher>())
    , reporter_(std::make_unique<YieldReporter>())
{
}

YieldMonitor::~YieldMonitor()
{
    Stop();
}

void YieldMonitor::Initialize(const std::wstring& watchDirectory, int machineId,
                              const std::wstring& lineNum, const std::wstring& mcNum,
                              const std::wstring& serverUrl)
{
    config_.watchDirectory   = watchDirectory;
    config_.machineId        = machineId;
    config_.lineNumber       = lineNum;
    config_.mcNumber         = mcNum;
    config_.serverUrl        = serverUrl;

    
    fileWatcher_->Initialize(
        config_.watchDirectory,
        config_.stabilitySeconds,
        config_.maxReadRetries,
        [this](const std::wstring& path, const std::string& content) {
            OnFileReady(path, content);
        }
    );

    reporter_->Initialize(config_.serverUrl, config_.machineId, config_.uploadQueueLimit);
}

void YieldMonitor::UpdateMachineId(int machineId)
{
    config_.machineId = machineId;
    reporter_->UpdateMachineId(machineId);
}

void YieldMonitor::Start()
{
    reporter_->Start();
    fileWatcher_->Start();

    std::string dirStr = NetworkUtils::ConvertWStringToString(config_.watchDirectory);
    Logger::Info("YieldMonitor started (directory=" + dirStr + ")");
}

void YieldMonitor::Stop()
{
    fileWatcher_->Stop();
    reporter_->Stop();
    Logger::Info("YieldMonitor stopped.");
}





void YieldMonitor::OnFileReady(const std::wstring& filePath, const std::string& content)
{
    YieldResult result;

    if (!YieldXmlParser::Parse(content, result)) {
        return; 
    }

    
    std::string pathStr = NetworkUtils::ConvertWStringToString(filePath);
    result.trayId     = YieldXmlParser::ExtractTrayIdFromPath(pathStr);
    result.dateString = YieldXmlParser::ExtractDateFromPath(pathStr);

    
    reporter_->Enqueue(result);
}
