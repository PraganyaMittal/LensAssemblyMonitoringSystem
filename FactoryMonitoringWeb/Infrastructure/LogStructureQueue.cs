using FactoryMonitoringWeb.Models.DTOs;

namespace FactoryMonitoringWeb.Infrastructure
{
    public record LogStructureUpdate(int PCId, string LogStructureJson);

    public class LogStructureQueue : ChannelWriteQueue<LogStructureUpdate>
    {
        public LogStructureQueue(ILogger<LogStructureQueue> logger) 
            : base(capacity: 5000, logger: logger)
        {
        }
    }
}
