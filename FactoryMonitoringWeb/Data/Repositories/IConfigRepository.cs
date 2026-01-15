using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// Repository interface for ConfigFile entities.
    /// 
    /// Design Decision: CQRS-optimized interface:
    /// - Command methods (UpsertConfigAsync) for writes
    /// - Query methods (GetPendingUpdateAsync) for reads
    /// 
    /// Efficiency: Avoids loading large ConfigContent strings when only checking
    /// existence or status. Uses projections and targeted updates.
    /// </summary>
    public interface IConfigRepository : IRepository<ConfigFile>
    {
        /// <summary>
        /// Gets config by PC ID without loading the large content strings.
        /// Use for existence checks and status queries.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>ConfigFile with only metadata loaded, or null</returns>
        Task<ConfigFile?> GetByPCIdAsync(int pcId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Efficiently upserts config content from agent.
        /// 
        /// Strategy:
        /// 1. Check if record exists (ID lookup only, no content load)
        /// 2. If exists: update content and timestamp
        /// 3. If new: insert new record
        /// 4. If PendingUpdate was set, atomically clear it and set UpdateApplied
        /// 
        /// Transactional: All operations within single SaveChanges call.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="configContent">Current config content from agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Result indicating whether this was an insert or update, and if pending update was cleared</returns>
        Task<ConfigUpsertResult> UpsertConfigAsync(
            int pcId,
            string configContent,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets pending update info for a PC.
        /// Read-only query optimized for the "check for updates" flow.
        /// Does NOT load the full current ConfigContent to save memory.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Pending update info if available, or null</returns>
        Task<PendingConfigUpdate?> GetPendingUpdateAsync(
            int pcId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Sets a pending config update for a PC.
        /// Called by the web UI when an operator wants to push new config.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="newContent">The new config content to push</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>True if successful, false if PC config doesn't exist</returns>
        Task<bool> SetPendingUpdateAsync(
            int pcId,
            string newContent,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Result of config upsert operation.
    /// </summary>
    public class ConfigUpsertResult
    {
        /// <summary>Whether the config was newly created (vs updated).</summary>
        public bool IsNewConfig { get; init; }

        /// <summary>Whether a pending update was cleared by this sync.</summary>
        public bool PendingUpdateCleared { get; init; }

        /// <summary>The config record ID.</summary>
        public int ConfigId { get; init; }

        public static ConfigUpsertResult Created(int configId) => new()
        {
            IsNewConfig = true,
            PendingUpdateCleared = false,
            ConfigId = configId
        };

        public static ConfigUpsertResult Updated(int configId, bool pendingCleared) => new()
        {
            IsNewConfig = false,
            PendingUpdateCleared = pendingCleared,
            ConfigId = configId
        };
    }

    /// <summary>
    /// Pending config update info (read-only projection).
    /// </summary>
    public class PendingConfigUpdate
    {
        /// <summary>The new content to push to the agent.</summary>
        public string UpdatedContent { get; init; } = string.Empty;

        /// <summary>When the update was requested.</summary>
        public DateTime? RequestTime { get; init; }
    }
}
