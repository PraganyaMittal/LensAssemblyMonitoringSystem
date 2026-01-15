using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Services;

using FactoryMonitoringWeb.Models.Exceptions;

namespace FactoryMonitoringWeb.Commands.Log
{
    /// <summary>
    /// Handles SyncLogStructureCommand by delegating to ILogService.
    /// </summary>
    public class SyncLogStructureHandler : ICommandHandler<SyncLogStructureCommand, SyncLogStructureResult>
    {
        private readonly ILogService _logService;
        private readonly ILogger<SyncLogStructureHandler> _logger;

        public SyncLogStructureHandler(
            ILogService logService,
            ILogger<SyncLogStructureHandler> logger)
        {
            _logService = logService ?? throw new ArgumentNullException(nameof(logService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<SyncLogStructureResult> HandleAsync(
            SyncLogStructureCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Handling log structure sync for PC {PCId}",
                command.PCId);

            try
            {
                await _logService.SyncLogStructureAsync(
                    command.PCId,
                    command.LogStructureJson,
                    cancellationToken);

                _logger.LogInformation(
                    "Log structure synced for PC {PCId}",
                    command.PCId);

                return SyncLogStructureResult.Succeeded();
            }
            catch (AgentNotFoundException)
            {
                _logger.LogWarning("PC {PCId} not found", command.PCId);
                return SyncLogStructureResult.Failed("PC not found");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync log structure for PC {PCId}", command.PCId);
                return SyncLogStructureResult.Failed(ex.Message);
            }
        }
    }
}
