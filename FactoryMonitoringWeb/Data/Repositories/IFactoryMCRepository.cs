using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// Repository interface for FactoryMC entities.
    /// Extends generic IRepository with domain-specific query methods.
    /// 
    /// Design Decision: Separate interface per aggregate root because:
    /// 1. Interface Segregation Principle - clients depend only on methods they use
    /// 2. Domain-specific methods improve readability over generic queries
    /// 3. Enables different implementations (SQL, cache, mock)
    /// </summary>
    public interface IFactoryMCRepository : IRepository<FactoryMC>
    {
        /// <summary>
        /// Finds a MC by its line number, MC number, and model version combination.
        /// This is the business key for agent registration.
        /// </summary>
        /// <param name="lineNumber">The factory line number</param>
        /// <param name="mcNumber">The MC number within the line</param>
        /// <param name="modelVersion">The model version (e.g., "3.5", "4.0")</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The matching MC if found, null otherwise</returns>
        Task<FactoryMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Finds a MC by its IP Address.
        /// This is the primary lookup key for agent registration.
        /// </summary>
        /// <param name="ipAddress">The IP Address of the MC</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The matching MC if found, null otherwise</returns>
        Task<FactoryMC?> FindByIpAsync(
            string ipAddress,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets all MCs that are currently marked as online.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Collection of online MCs</returns>
        Task<IEnumerable<FactoryMC>> GetOnlineMCsAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets all MCs that haven't sent a heartbeat since the specified time.
        /// Used by HeartbeatMonitorService to detect stale connections.
        /// </summary>
        /// <param name="cutoffTime">Time before which heartbeats are considered stale</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Collection of MCs with stale heartbeats</returns>
        Task<IEnumerable<FactoryMC>> GetMCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Marks multiple MCs as offline in a batch operation.
        /// More efficient than individual updates for heartbeat monitoring.
        /// </summary>
        /// <param name="mcIds">IDs of MCs to mark offline</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Number of MCs updated</returns>
        Task<int> MarkMCsOfflineAsync(
            IEnumerable<int> mcIds,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets a MC by ID with related entities eagerly loaded.
        /// Use when you need ConfigFile or Models relationships.
        /// </summary>
        /// <param name="mcId">The MC ID</param>
        /// <param name="includeConfig">Whether to include ConfigFile</param>
        /// <param name="includeModels">Whether to include Models</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The MC with related entities if found, null otherwise</returns>
        Task<FactoryMC?> GetByIdWithRelatedAsync(
            int mcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default);
    }
}
