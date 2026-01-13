using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// Repository interface for Model entities.
    /// 
    /// Design Decision: Efficient sync operation that:
    /// 1. Inserts new models
    /// 2. Updates existing models
    /// 3. Removes deleted models (not in sync request)
    /// 4. Tracks model usage (LastUsed when switching current model)
    /// </summary>
    public interface IModelRepository : IRepository<Model>
    {
        /// <summary>
        /// Gets all models for a specific PC.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>List of models for the PC</returns>
        Task<IList<Model>> GetByPCIdAsync(int pcId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Syncs models from agent in a single transaction.
        /// 
        /// Logic:
        /// 1. Fetch existing models for PC
        /// 2. For each model in request:
        ///    - If exists: update path and current status
        ///    - If new: insert with discovery date
        /// 3. Remove models not in request
        /// 4. Track LastUsed when model becomes current
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="models">Models from agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Sync result with counts</returns>
        Task<ModelSyncResult> SyncModelsAsync(
            int pcId,
            IEnumerable<ModelSyncInfo> models,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets the current active model for a PC.
        /// </summary>
        /// <param name="pcId">The PC ID</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Current model if any, null otherwise</returns>
        Task<Model?> GetCurrentModelAsync(int pcId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Model info from sync request.
    /// </summary>
    public class ModelSyncInfo
    {
        public string ModelName { get; set; } = string.Empty;
        public string ModelPath { get; set; } = string.Empty;
        public bool IsCurrent { get; set; }
    }

    /// <summary>
    /// Result of model sync operation.
    /// </summary>
    public class ModelSyncResult
    {
        public int InsertedCount { get; init; }
        public int UpdatedCount { get; init; }
        public int RemovedCount { get; init; }
        public string? CurrentModelName { get; init; }

        public static ModelSyncResult Create(int inserted, int updated, int removed, string? currentModel) => new()
        {
            InsertedCount = inserted,
            UpdatedCount = updated,
            RemovedCount = removed,
            CurrentModelName = currentModel
        };
    }
}
