using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Data.Repositories
{

    public interface IModelRepository : IRepository<Model>
    {

        Task<IList<Model>> GetByMCIdAsync(int MCId, CancellationToken cancellationToken = default);

        Task<ModelSyncResult> SyncModelsAsync(
            int MCId,
            IEnumerable<ModelSyncInfo> models,
            CancellationToken cancellationToken = default);

        Task<Model?> GetCurrentModelAsync(int MCId, CancellationToken cancellationToken = default);

        Task UpdateCurrentModelAsync(int MCId, string? currentModelName, CancellationToken cancellationToken = default);
    }

    public class ModelSyncInfo
    {
        public string ModelName { get; set; } = string.Empty;
        public string ModelPath { get; set; } = string.Empty;
        public bool IsCurrent { get; set; }
    }

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

