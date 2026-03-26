using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Services;

using LensAssemblyMonitoringWeb.Models.Exceptions;

namespace LensAssemblyMonitoringWeb.Commands.Log
{

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
                "Handling log structure sync for MC {MCId}",
                command.MCId);

            try
            {
                await _logService.SyncLogStructureAsync(
                    command.MCId,
                    command.LogStructureJson,
                    cancellationToken);

                _logger.LogInformation(
                    "Log structure synced for MC {MCId}",
                    command.MCId);

                return SyncLogStructureResult.Succeeded();
            }
            catch (AgentNotFoundException)
            {
                _logger.LogWarning("MC {MCId} not found", command.MCId);
                return SyncLogStructureResult.Failed("MC not found");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync log structure for MC {MCId}", command.MCId);
                return SyncLogStructureResult.Failed(ex.Message);
            }
        }
    }
}

