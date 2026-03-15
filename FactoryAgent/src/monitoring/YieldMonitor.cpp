#include "../include/monitoring/YieldMonitor.h"
#include "../include/monitoring/YieldXmlParser.h"
#include "../include/monitoring/YieldFileWatcher.h"
#include "../include/monitoring/YieldReporter.h"
#include "../include/utilities/NetworkUtils.h"
#include "../include/utils/Logger.h"

YieldMonitor::YieldMonitor()
    : fileWatcher_(std::make_unique<Yield::YieldFileWatcher>())
    , reporter_(std::make_unique<Yield::YieldReporter>())
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
    FactoryAgent::Utils::Logger::Info("YieldMonitor started (directory=" + dirStr + ")");
}

void YieldMonitor::Stop()
{
    fileWatcher_->Stop();
    reporter_->Stop();
    FactoryAgent::Utils::Logger::Info("YieldMonitor stopped.");
}





void YieldMonitor::OnFileReady(const std::wstring& filePath, const std::string& content)
{
    Yield::YieldResult result;

    if (!Yield::YieldXmlParser::Parse(content, result)) {
        return; 
    }

    
    std::string pathStr = NetworkUtils::ConvertWStringToString(filePath);
    result.trayId     = Yield::YieldXmlParser::ExtractTrayIdFromPath(pathStr);
    result.dateString = Yield::YieldXmlParser::ExtractDateFromPath(pathStr);

    
    reporter_->Enqueue(result);
}
