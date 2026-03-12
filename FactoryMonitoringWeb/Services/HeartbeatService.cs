using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.SignalR;
using FactoryMonitoringWeb.Controllers.Hubs;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Implementation of heartbeat processing business logic.
    /// 
    /// Concurrency Strategy:
    /// 1. MC update uses repository's atomic update
    /// 2. Command fetching uses lock-free optimistic concurrency
    /// 3. MarkCommandsInProgress only updates still-pending commands
    /// 
    /// Performance Optimizations:
    /// 1. Single round-trip for MC update
    /// 2. Single round-trip for command fetch + mark in-progress
    /// 3. No unnecessary EF tracking for read-only operations
    /// 
    /// Thread Safety: This service is stateless and safe for concurrent use.
    /// All mutable state is in the database, protected by atomic operations.
    /// </summary>
    public class HeartbeatService : IHeartbeatService
    {
        private readonly IFactoryMCRepository _mcRepository;
        private readonly IAgentCommandRepository _commandRepository;
        private readonly ILogger<HeartbeatService> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        private static readonly string[] ExcludedCommandTypes = { "GetLogFileContent" };

        public HeartbeatService(
            IFactoryMCRepository mcRepository,
            IAgentCommandRepository commandRepository,
            ILogger<HeartbeatService> logger,
            IHubContext<AgentHub> hubContext)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        }

        /// <inheritdoc/>
        public async Task<HeartbeatResult> ProcessHeartbeatAsync(
            HeartbeatRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Processing heartbeat for MC {MCId}, AppRunning={AppRunning}",
                request.MCId,
                request.IsApplicationRunning);

            try
            {
                var mc = await _mcRepository.GetByIdAsync(request.MCId, cancellationToken);

                if (mc == null)
                {
                    _logger.LogWarning("Orphaned Agent detected for MC {MCId}. Sending Auto-Reset command.", request.MCId);

                    var resetCommand = new CommandInfo
                    {
                        CommandId = 0,
                        CommandType = "ResetAgent",
                        CommandData = "Orphaned MC - Auto Reset"
                    };

                    return HeartbeatResult.Succeeded(new List<CommandInfo> { resetCommand });
                }

                bool wasOffline = !mc.IsOnline;
                bool wasAppNotRunning = mc.IsApplicationRunning != request.IsApplicationRunning;

                mc.LastHeartbeat = DateTime.UtcNow;
                mc.IsOnline = true;
                mc.IsApplicationRunning = request.IsApplicationRunning;
                mc.LastUpdated = DateTime.UtcNow;

                await _mcRepository.UpdateAsync(mc, cancellationToken);

                // Broadcast state change to UI instances
                if (wasOffline || wasAppNotRunning)
                {
                    await _hubContext.Clients.All.SendAsync("McStatusChanged", new
                    {
                        MCId = mc.MCId,
                        IsOnline = mc.IsOnline,
                        IsApplicationRunning = mc.IsApplicationRunning,
                        LastHeartbeat = mc.LastHeartbeat
                    }, cancellationToken);
                }

                var pendingCommands = await _commandRepository.GetPendingCommandsAsync(
                    request.MCId,
                    ExcludedCommandTypes,
                    cancellationToken);

                if (pendingCommands.Count > 0)
                {
                    var commandIds = pendingCommands.Select(c => c.CommandId).ToList();
                    var markedCount = await _commandRepository.MarkCommandsInProgressAsync(
                        commandIds,
                        cancellationToken);

                    _logger.LogDebug(
                        "MC {MCId}: {PendingCount} commands pending, {MarkedCount} marked InProgress",
                        request.MCId,
                        pendingCommands.Count,
                        markedCount);
                }

                var commandInfos = pendingCommands.Select(c => new CommandInfo
                {
                    CommandId = c.CommandId,
                    CommandType = c.CommandType,
                    CommandData = c.CommandData
                }).ToList();

                _logger.LogDebug(
                    "Heartbeat processed for MC {MCId}: {CommandCount} commands returned",
                    request.MCId,
                    commandInfos.Count);

                return HeartbeatResult.Succeeded(commandInfos);
            }
            catch (AgentNotFoundException)
            {
                throw;
            }
            catch (RepositoryException ex)
            {
                _logger.LogError(ex, "Repository error processing heartbeat for MC {MCId}", request.MCId);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error processing heartbeat for MC {MCId}", request.MCId);
                throw new CommandExecutionException(
                    commandId: null,
                    commandType: "Heartbeat",
                    reason: ex.Message,
                    correlationId: correlationId,
                    innerException: ex);
            }
        }
    }
}
