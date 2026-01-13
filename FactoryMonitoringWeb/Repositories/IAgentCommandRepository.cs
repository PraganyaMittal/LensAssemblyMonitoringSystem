using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Repositories
{
    /// <summary>
    /// Repository interface for AgentCommand entities.
    /// 
    /// Design Decision: Optimized for high-throughput heartbeat processing:
    /// 1. Batch operations to reduce database round-trips
    /// 2. Filtered queries to avoid loading unnecessary data
    /// 3. Atomic status updates to prevent race conditions
    /// 
    /// Concurrency: Commands may be fetched and updated concurrently by multiple
    /// heartbeat requests. The implementation must handle this safely.
    /// </summary>
    public interface IAgentCommandRepository : IRepository<AgentCommand>
    {
        /// <summary>
        /// Gets all pending commands for a specific PC, excluding specified command types.
        /// Used by heartbeat to retrieve commands that should be sent to the agent.
        /// 
        /// Performance: Uses indexed query on (PCId, Status) composite index.
        /// </summary>
        /// <param name="pcId">The PC ID to get commands for</param>
        /// <param name="excludedCommandTypes">Command types to exclude (e.g., "GetLogFileContent")</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Pending commands ordered by creation date</returns>
        Task<IList<AgentCommand>> GetPendingCommandsAsync(
            int pcId,
            IEnumerable<string>? excludedCommandTypes = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Atomically marks multiple commands as InProgress and sets execution time.
        /// Uses optimistic concurrency to handle race conditions.
        /// 
        /// Concurrency: If another request already marked a command as InProgress,
        /// that command is skipped (not returned in the result set).
        /// </summary>
        /// <param name="commandIds">IDs of commands to mark as in-progress</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Number of commands actually updated</returns>
        Task<int> MarkCommandsInProgressAsync(
            IEnumerable<int> commandIds,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets a command by ID with its associated PC loaded.
        /// Used when recording command results.
        /// </summary>
        /// <param name="commandId">The command ID</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The command with PC navigation property, or null</returns>
        Task<AgentCommand?> GetByIdWithPCAsync(
            int commandId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Updates command result and status atomically.
        /// </summary>
        /// <param name="commandId">The command ID</param>
        /// <param name="status">New status</param>
        /// <param name="resultData">Result data (nullable)</param>
        /// <param name="errorMessage">Error message (nullable)</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>True if updated, false if command not found</returns>
        Task<bool> UpdateCommandResultAsync(
            int commandId,
            string status,
            string? resultData,
            string? errorMessage,
            CancellationToken cancellationToken = default);
    }
}
