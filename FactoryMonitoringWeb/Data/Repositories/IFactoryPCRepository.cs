using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// Repository interface for FactoryPC entities.
    /// Extends generic IRepository with domain-specific query methods.
    /// 
    /// Design Decision: Separate interface per aggregate root because:
    /// 1. Interface Segregation Principle - clients depend only on methods they use
    /// 2. Domain-specific methods improve readability over generic queries
    /// 3. Enables different implementations (SQL, cache, mock)
    /// </summary>
    public interface IFactoryPCRepository : IRepository<FactoryPC>
    {
        /// <summary>
        /// Finds a PC by its line number, PC number, and model version combination.
        /// This is the business key for agent registration.
        /// </summary>
        /// <param name="lineNumber">The factory line number</param>
        /// <param name="pcNumber">The PC number within the line</param>
        /// <param name="modelVersion">The model version (e.g., "3.5", "4.0")</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The matching PC if found, null otherwise</returns>
        Task<FactoryPC?> FindByLineAndPCAsync(
            int lineNumber,
            int pcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets all PCs that are currently marked as online.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Collection of online PCs</returns>
        Task<IEnumerable<FactoryPC>> GetOnlinePCsAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets all PCs that haven't sent a heartbeat since the specified time.
        /// Used by HeartbeatMonitorService to detect stale connections.
        /// </summary>
        /// <param name="cutoffTime">Time before which heartbeats are considered stale</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Collection of PCs with stale heartbeats</returns>
        Task<IEnumerable<FactoryPC>> GetPCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Marks multiple PCs as offline in a batch operation.
        /// More efficient than individual updates for heartbeat monitoring.
        /// </summary>
        /// <param name="pcIds">IDs of PCs to mark offline</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Number of PCs updated</returns>
        Task<int> MarkPCsOfflineAsync(
            IEnumerable<int> pcIds,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets a PC by ID with related entities eagerly loaded.
        /// Use when you need ConfigFile or Models relationships.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="includeConfig">Whether to include ConfigFile</param>
        /// <param name="includeModels">Whether to include Models</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The PC with related entities if found, null otherwise</returns>
        Task<FactoryPC?> GetByIdWithRelatedAsync(
            int pcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default);
    }
}
