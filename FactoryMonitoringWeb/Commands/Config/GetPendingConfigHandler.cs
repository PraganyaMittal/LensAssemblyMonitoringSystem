using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Data.Repositories;

namespace FactoryMonitoringWeb.Commands.Config
{
    /// <summary>
    /// Handles GetPendingConfigQuery - the READ side of config CQRS.
    /// 
    /// Design Decision: Read handler is kept simple and fast:
    /// 1. No writes to database
    /// 2. Uses projections to avoid loading unnecessary data
    /// 3. No side effects
    /// </summary>
    public class GetPendingConfigHandler : ICommandHandler<GetPendingConfigQuery, PendingConfigResult>
    {
        private readonly IConfigRepository _configRepository;
        private readonly ILogger<GetPendingConfigHandler> _logger;

        public GetPendingConfigHandler(
            IConfigRepository configRepository,
            ILogger<GetPendingConfigHandler> logger)
        {
            _configRepository = configRepository ?? throw new ArgumentNullException(nameof(configRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<PendingConfigResult> HandleAsync(
            GetPendingConfigQuery query,
            CancellationToken cancellationToken = default)
        {
            if (query == null)
            {
                throw new ArgumentNullException(nameof(query));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug("Checking pending config for PC {MCId}", query.MCId);

            try
            {
                var pending = await _configRepository.GetPendingUpdateAsync(
                    query.MCId,
                    cancellationToken);

                if (pending == null)
                {
                    _logger.LogDebug("No pending config update for PC {MCId}", query.MCId);
                    return PendingConfigResult.NoPending();
                }

                _logger.LogDebug(
                    "Found pending config update for PC {MCId}, requested at {RequestTime}",
                    query.MCId,
                    pending.RequestTime);

                return PendingConfigResult.WithPending(pending.UpdatedContent, pending.RequestTime);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to check pending config for PC {MCId}", query.MCId);
                return PendingConfigResult.Failed($"Failed to check pending config: {ex.Message}");
            }
        }
    }
}
