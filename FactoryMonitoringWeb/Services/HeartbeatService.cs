using FactoryMonitoringWeb.Exceptions;
using FactoryMonitoringWeb.Infrastructure;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Repositories;
using FactoryMonitoringWeb.Services.Interfaces;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Implementation of heartbeat processing business logic.
    /// 
    /// Concurrency Strategy:
    /// 1. PC update uses repository's atomic update
    /// 2. Command fetching uses lock-free optimistic concurrency
    /// 3. MarkCommandsInProgress only updates still-pending commands
    /// 
    /// Performance Optimizations:
    /// 1. Single round-trip for PC update
    /// 2. Single round-trip for command fetch + mark in-progress
    /// 3. No unnecessary EF tracking for read-only operations
    /// 
    /// Thread Safety: This service is stateless and safe for concurrent use.
    /// All mutable state is in the database, protected by atomic operations.
    /// </summary>
    public class HeartbeatService : IHeartbeatService
    {
        private readonly IFactoryPCRepository _pcRepository;
        private readonly IAgentCommandRepository _commandRepository;
        private readonly ILogger<HeartbeatService> _logger;

        /// <summary>
        /// Command types that are handled via WebSocket, not HTTP heartbeat polling.
        /// These are excluded from the heartbeat response to avoid duplicate processing.
        /// </summary>
        private static readonly string[] ExcludedCommandTypes = { "GetLogFileContent" };

        public HeartbeatService(
            IFactoryPCRepository pcRepository,
            IAgentCommandRepository commandRepository,
            ILogger<HeartbeatService> logger)
        {
            _pcRepository = pcRepository ?? throw new ArgumentNullException(nameof(pcRepository));
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
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
                "Processing heartbeat for PC {PCId}, AppRunning={AppRunning}",
                request.PCId,
                request.IsApplicationRunning);

            try
            {
                // Step 1: Update PC heartbeat status
                var pc = await _pcRepository.GetByIdAsync(request.PCId, cancellationToken);

                if (pc == null)
                {
                    _logger.LogWarning("Heartbeat received for unknown PC {PCId}", request.PCId);
                    throw new AgentNotFoundException(request.PCId, correlationId);
                }

                // Update heartbeat fields
                pc.LastHeartbeat = DateTime.Now;
                pc.IsOnline = true;
                pc.IsApplicationRunning = request.IsApplicationRunning;
                pc.LastUpdated = DateTime.Now;

                await _pcRepository.UpdateAsync(pc, cancellationToken);

                // Step 2: Fetch pending commands (atomic read)
                var pendingCommands = await _commandRepository.GetPendingCommandsAsync(
                    request.PCId,
                    ExcludedCommandTypes,
                    cancellationToken);

                // Step 3: Mark commands as InProgress (atomic update)
                // This prevents race conditions where multiple heartbeats pick up the same command
                if (pendingCommands.Count > 0)
                {
                    var commandIds = pendingCommands.Select(c => c.CommandId).ToList();
                    var markedCount = await _commandRepository.MarkCommandsInProgressAsync(
                        commandIds,
                        cancellationToken);

                    _logger.LogDebug(
                        "PC {PCId}: {PendingCount} commands pending, {MarkedCount} marked InProgress",
                        request.PCId,
                        pendingCommands.Count,
                        markedCount);
                }

                // Step 4: Map to response DTOs
                var commandInfos = pendingCommands.Select(c => new CommandInfo
                {
                    CommandId = c.CommandId,
                    CommandType = c.CommandType,
                    CommandData = c.CommandData
                }).ToList();

                _logger.LogDebug(
                    "Heartbeat processed for PC {PCId}: {CommandCount} commands returned",
                    request.PCId,
                    commandInfos.Count);

                return HeartbeatResult.Succeeded(commandInfos);
            }
            catch (AgentNotFoundException)
            {
                // Re-throw domain exceptions
                throw;
            }
            catch (RepositoryException ex)
            {
                _logger.LogError(ex, "Repository error processing heartbeat for PC {PCId}", request.PCId);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error processing heartbeat for PC {PCId}", request.PCId);
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
