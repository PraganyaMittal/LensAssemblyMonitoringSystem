using FactoryMonitoringWeb.Data.Repositories;

namespace FactoryMonitoringWeb.Commands.Model
{
    /// <summary>
    /// Command to sync models from agent to server.
    /// </summary>
    public class SyncModelsCommand : ICommand<SyncModelsResult>
    {
        public int MCId { get; }
        public IReadOnlyList<ModelSyncInfo> Models { get; }

        public SyncModelsCommand(int MCId, IEnumerable<ModelSyncInfo> models)
        {
            if (MCId <= 0)
            {
                throw new ArgumentException("PC ID must be positive", nameof(MCId));
            }

            this.MCId = MCId;
            Models = models?.ToList() ?? throw new ArgumentNullException(nameof(models));
        }
    }

    /// <summary>
    /// Result of model sync operation.
    /// </summary>
    public class SyncModelsResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public int InsertedCount { get; init; }
        public int UpdatedCount { get; init; }
        public int RemovedCount { get; init; }
        public string? CurrentModelName { get; init; }

        public static SyncModelsResult Succeeded(ModelSyncResult repoResult) => new()
        {
            Success = true,
            Message = "Models synced successfully",
            InsertedCount = repoResult.InsertedCount,
            UpdatedCount = repoResult.UpdatedCount,
            RemovedCount = repoResult.RemovedCount,
            CurrentModelName = repoResult.CurrentModelName
        };

        public static SyncModelsResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}
