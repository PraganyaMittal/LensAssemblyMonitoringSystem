using FactoryMonitoringWeb.Services.Interfaces;

namespace FactoryMonitoringWeb.Commands.Log
{
    /// <summary>
    /// Command to sync log structure (directory tree) from agent.
    /// </summary>
    public class SyncLogStructureCommand : ICommand<SyncLogStructureResult>
    {
        public int PCId { get; }
        public string LogStructureJson { get; }

        public SyncLogStructureCommand(int pcId, string logStructureJson)
        {
            if (pcId <= 0)
            {
                throw new ArgumentException("PC ID must be positive", nameof(pcId));
            }

            PCId = pcId;
            LogStructureJson = logStructureJson ?? throw new ArgumentNullException(nameof(logStructureJson));
        }
    }

    /// <summary>
    /// Result of log structure sync.
    /// </summary>
    public class SyncLogStructureResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;

        public static SyncLogStructureResult Succeeded() => new()
        {
            Success = true,
            Message = "Log structure synced"
        };

        public static SyncLogStructureResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}
