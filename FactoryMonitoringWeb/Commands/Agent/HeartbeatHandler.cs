using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Services;
using System.Diagnostics;

namespace FactoryMonitoringWeb.Commands.Agent
{
    public class HeartbeatHandler : ICommandHandler<HeartbeatCommand, HeartbeatResult>
    {
        private readonly IHeartbeatService _heartbeatService;
        private readonly ILogger<HeartbeatHandler> _logger;

        private const int SlowHeartbeatThresholdMs = 100;

        public HeartbeatHandler(
            IHeartbeatService heartbeatService,
            ILogger<HeartbeatHandler> logger)
        {
            _heartbeatService = heartbeatService ?? throw new ArgumentNullException(nameof(heartbeatService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<HeartbeatResult> HandleAsync(
            HeartbeatCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;
            var stopwatch = Stopwatch.StartNew();

            _logger.LogDebug(
                "Handling heartbeat for MC {MCId}",
                command.Request.MCId);

            try
            {
                var result = await _heartbeatService.ProcessHeartbeatAsync(
                    command.Request,
                    cancellationToken);

                stopwatch.Stop();

                if (stopwatch.ElapsedMilliseconds > SlowHeartbeatThresholdMs)
                {
                    _logger.LogWarning(
                        "Slow heartbeat for MC {MCId}: {ElapsedMs}ms (threshold: {ThresholdMs}ms)",
                        command.Request.MCId,
                        stopwatch.ElapsedMilliseconds,
                        SlowHeartbeatThresholdMs);
                }
                else
                {
                    _logger.LogDebug(
                        "Heartbeat for MC {MCId} completed in {ElapsedMs}ms, {CommandCount} commands",
                        command.Request.MCId,
                        stopwatch.ElapsedMilliseconds,
                        result.Commands.Count);
                }

                return result;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "Heartbeat failed for MC {MCId} after {ElapsedMs}ms",
                    command.Request.MCId,
                    stopwatch.ElapsedMilliseconds);
                throw;
            }
        }
    }
}

