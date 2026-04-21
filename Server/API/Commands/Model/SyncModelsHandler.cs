using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Data.Repositories;

namespace LensAssemblyMonitoringWeb.Commands.Model
{

    public class SyncModelsHandler : ICommandHandler<SyncModelsCommand, SyncModelsResult>
    {
        private readonly IModelRepository _modelRepository;
        private readonly ILogger<SyncModelsHandler> _logger;

        public SyncModelsHandler(
            IModelRepository modelRepository,
            ILogger<SyncModelsHandler> logger)
        {
            _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<SyncModelsResult> HandleAsync(
            SyncModelsCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Handling model sync for MC {MCId}, {Count} models",
                command.MCId,
                command.Models.Count);

            try
            {
                var result = await _modelRepository.SyncModelsAsync(
                    command.MCId,
                    command.Models,
                    cancellationToken);

                _logger.LogInformation(
                    "Model sync completed for MC {MCId}: +{Inserted} ~{Updated} -{Removed}",
                    command.MCId,
                    result.InsertedCount,
                    result.UpdatedCount,
                    result.RemovedCount);

                return SyncModelsResult.Succeeded(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync models for MC {MCId}", command.MCId);
                return SyncModelsResult.Failed($"Model sync failed: {ex.Message}");
            }
        }
    }
}

