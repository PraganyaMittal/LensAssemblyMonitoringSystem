using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;

namespace FactoryMonitoringWeb.Commands.Config
{
    /// <summary>
    /// Command to sync agent's config to the server.
    /// This is the WRITE side of the CQRS pattern for config.
    /// 
    /// Business Logic:
    /// 1. Upsert the config content
    /// 2. If PendingUpdate was set, atomically clear it and set UpdateApplied
    /// </summary>
    public class SyncConfigCommand : ICommand<SyncConfigResult>
    {
        /// <summary>The PC ID sending the config.</summary>
        public int MCId { get; }

        /// <summary>The current config content from the agent.</summary>
        public string ConfigContent { get; }

        public SyncConfigCommand(int MCId, string configContent)
        {
            if (MCId < 0)
            {
                throw new ArgumentException("PC ID cannot be negative", nameof(MCId));
            }

            this.MCId = MCId;
            ConfigContent = configContent ?? throw new ArgumentNullException(nameof(configContent));
        }
    }

    /// <summary>
    /// Result of config sync operation.
    /// </summary>
    public class SyncConfigResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public bool PendingUpdateCleared { get; init; }

        public static SyncConfigResult Succeeded(bool pendingCleared) => new()
        {
            Success = true,
            Message = pendingCleared ? "Config updated, pending update cleared" : "Config updated successfully",
            PendingUpdateCleared = pendingCleared
        };

        public static SyncConfigResult Failed(string message) => new()
        {
            Success = false,
            Message = message,
            PendingUpdateCleared = false
        };
    }
}
