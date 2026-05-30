using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Logs.Batching
{
    public record LogStructureUpdate(int MCId, string LogStructureJson);

    public class LogStructureQueue : ChannelWriteQueue<LogStructureUpdate>
    {
        public LogStructureQueue(ILogger<LogStructureQueue> logger) 
            : base(capacity: 5000, logger: logger)
        {
        }
    }
}



