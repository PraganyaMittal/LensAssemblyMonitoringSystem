using FactoryMonitoringWeb.Repositories;

namespace FactoryMonitoringWeb.Commands.Config
{
    /// <summary>
    /// Query to check if server has pending config update for agent.
    /// This is the READ side of the CQRS pattern for config.
    /// 
    /// Design Decision: Using ICommand<T> for queries because:
    /// 1. Unified dispatch mechanism through CommandDispatcher
    /// 2. Same cross-cutting concerns (logging, correlation)
    /// 3. Naming convention makes intent clear (Query vs Command)
    /// 
    /// In a pure CQRS system, you'd have separate IQuery<T> and IQueryHandler<T>.
    /// For simplicity, we reuse the command infrastructure.
    /// </summary>
    public class GetPendingConfigQuery : ICommand<PendingConfigResult>
    {
        /// <summary>The PC ID to check for pending updates.</summary>
        public int PCId { get; }

        public GetPendingConfigQuery(int pcId)
        {
            if (pcId <= 0)
            {
                throw new ArgumentException("PC ID must be positive", nameof(pcId));
            }

            PCId = pcId;
        }
    }

    /// <summary>
    /// Result of pending config query.
    /// </summary>
    public class PendingConfigResult
    {
        public bool Success { get; init; }
        public bool HasPendingUpdate { get; init; }
        public string? UpdatedContent { get; init; }
        public DateTime? UpdateRequestTime { get; init; }
        public string Message { get; init; } = string.Empty;

        public static PendingConfigResult NoPending() => new()
        {
            Success = true,
            HasPendingUpdate = false,
            Message = "No pending update"
        };

        public static PendingConfigResult WithPending(string content, DateTime? requestTime) => new()
        {
            Success = true,
            HasPendingUpdate = true,
            UpdatedContent = content,
            UpdateRequestTime = requestTime,
            Message = "Config update available"
        };

        public static PendingConfigResult Failed(string message) => new()
        {
            Success = false,
            HasPendingUpdate = false,
            Message = message
        };
    }
}
