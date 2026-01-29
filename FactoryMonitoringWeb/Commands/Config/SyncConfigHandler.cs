using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Data.Repositories;

namespace FactoryMonitoringWeb.Commands.Config
{
    /// <summary>
    /// Handles SyncConfigCommand - the WRITE side of config CQRS.
    /// 
    /// Design Decision: Handler directly uses repository (no service layer)
    /// because the business logic is simple: upsert with atomic state transition.
    /// Adding a service layer would be over-engineering for this use case.
    /// </summary>
    public class SyncConfigHandler : ICommandHandler<SyncConfigCommand, SyncConfigResult>
    {
        private readonly IConfigRepository _configRepository;
        private readonly ILogger<SyncConfigHandler> _logger;

        public SyncConfigHandler(
            IConfigRepository configRepository,
            ILogger<SyncConfigHandler> logger)
        {
            _configRepository = configRepository ?? throw new ArgumentNullException(nameof(configRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<SyncConfigResult> HandleAsync(
            SyncConfigCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Syncing config for PC {MCId}, content length: {Length}",
                command.MCId,
                command.ConfigContent.Length);

            try
            {
                var result = await _configRepository.UpsertConfigAsync(
                    command.MCId,
                    command.ConfigContent,
                    cancellationToken);

                if (result.PendingUpdateCleared)
                {
                    _logger.LogInformation(
                        "Config synced for PC {MCId}, pending update cleared",
                        command.MCId);
                }
                else
                {
                    _logger.LogDebug(
                        "Config synced for PC {MCId}, IsNew={IsNew}",
                        command.MCId,
                        result.IsNewConfig);
                }

                return SyncConfigResult.Succeeded(result.PendingUpdateCleared);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync config for PC {MCId}", command.MCId);
                return SyncConfigResult.Failed($"Config sync failed: {ex.Message}");
            }
        }
    }
}
