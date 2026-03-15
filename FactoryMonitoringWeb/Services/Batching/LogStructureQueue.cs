using FactoryMonitoringWeb.Models.DTOs;

namespace FactoryMonitoringWeb.Services.Batching
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

