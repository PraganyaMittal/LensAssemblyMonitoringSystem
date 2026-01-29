using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Services;
using System.Diagnostics;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Handles the HeartbeatCommand by delegating to IHeartbeatService.
    /// 
    /// Design Decision: Handler adds cross-cutting concerns:
    /// 1. Performance timing for throughput monitoring
    /// 2. Correlation ID logging for distributed tracing
    /// 3. Structured logging for observability
    /// 
    /// Performance: Handler is kept lightweight to minimize overhead
    /// in the high-throughput heartbeat path.
    /// </summary>
    public class HeartbeatHandler : ICommandHandler<HeartbeatCommand, HeartbeatResult>
    {
        private readonly IHeartbeatService _heartbeatService;
        private readonly ILogger<HeartbeatHandler> _logger;

        /// <summary>
        /// Threshold in milliseconds above which heartbeat processing is logged as slow.
        /// </summary>
        private const int SlowHeartbeatThresholdMs = 100;

        public HeartbeatHandler(
            IHeartbeatService heartbeatService,
            ILogger<HeartbeatHandler> logger)
        {
            _heartbeatService = heartbeatService ?? throw new ArgumentNullException(nameof(heartbeatService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <inheritdoc/>
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
                "Handling heartbeat for PC {MCId}",
                command.Request.MCId);

            try
            {
                var result = await _heartbeatService.ProcessHeartbeatAsync(
                    command.Request,
                    cancellationToken);

                stopwatch.Stop();

                // Log slow heartbeats for performance monitoring
                if (stopwatch.ElapsedMilliseconds > SlowHeartbeatThresholdMs)
                {
                    _logger.LogWarning(
                        "Slow heartbeat for PC {MCId}: {ElapsedMs}ms (threshold: {ThresholdMs}ms)",
                        command.Request.MCId,
                        stopwatch.ElapsedMilliseconds,
                        SlowHeartbeatThresholdMs);
                }
                else
                {
                    _logger.LogDebug(
                        "Heartbeat for PC {MCId} completed in {ElapsedMs}ms, {CommandCount} commands",
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
                    "Heartbeat failed for PC {MCId} after {ElapsedMs}ms",
                    command.Request.MCId,
                    stopwatch.ElapsedMilliseconds);
                throw;
            }
        }
    }
}
