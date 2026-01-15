using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Data.Repositories;

namespace FactoryMonitoringWeb.Commands.Model
{
    /// <summary>
    /// Handles SyncModelsCommand by delegating to IModelRepository.
    /// </summary>
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
                "Handling model sync for PC {PCId}, {Count} models",
                command.PCId,
                command.Models.Count);

            try
            {
                var result = await _modelRepository.SyncModelsAsync(
                    command.PCId,
                    command.Models,
                    cancellationToken);

                _logger.LogInformation(
                    "Model sync completed for PC {PCId}: +{Inserted} ~{Updated} -{Removed}",
                    command.PCId,
                    result.InsertedCount,
                    result.UpdatedCount,
                    result.RemovedCount);

                return SyncModelsResult.Succeeded(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync models for PC {PCId}", command.PCId);
                return SyncModelsResult.Failed($"Model sync failed: {ex.Message}");
            }
        }
    }
}
