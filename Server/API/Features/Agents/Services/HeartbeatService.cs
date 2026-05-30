using LensAssemblyMonitoringWeb.Shared.Exceptions;
using LensAssemblyMonitoringWeb.Features.Logs.Batching;
using LensAssemblyMonitoringWeb.Shared.Correlation;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Data;
using LensAssemblyMonitoringWeb.Features.Machines.Data;
using LensAssemblyMonitoringWeb.Features.Models.Data;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Features.Logs.Services;
using LensAssemblyMonitoringWeb.Features.Yield.Services;
using LensAssemblyMonitoringWeb.Shared.FileSystem;
using Microsoft.AspNetCore.SignalR;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{

    public class HeartbeatService : IHeartbeatService
    {
        private readonly ILensAssemblyMCRepository _mcRepository;
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IModelRepository _modelRepository;
        private readonly ILogger<HeartbeatService> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        private static readonly string[] ExcludedCommandTypes = { "GetLogFileContent" };

        public HeartbeatService(
            ILensAssemblyMCRepository mcRepository,
            IAgentCommandRepository commandRepository,
            IModelRepository modelRepository,
            ILogger<HeartbeatService> logger,
            IHubContext<AgentHub> hubContext)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        }

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

                if (mc.LifecycleState == "Decommissioned")
                {
                    _logger.LogWarning("Decommissioned Agent {MCId} attempted heartbeat. Sending Auto-Reset command.", request.MCId);

                    var resetCommand = new CommandInfo
                    {
                        CommandId = 0,
                        CommandType = "ResetAgent",
                        CommandData = "Decommissioned MC - Auto Reset"
                    };

                    return HeartbeatResult.Succeeded(new List<CommandInfo> { resetCommand });
                }

                bool wasOffline = !mc.IsOnline;
                bool wasAppNotRunning = mc.IsApplicationRunning != request.IsApplicationRunning;

                bool versionChanged = mc.AgentVersion != request.AgentVersion
                    || mc.ServiceVersion != request.ServiceVersion
                    || mc.AutoUpdaterVersion != request.AutoUpdaterVersion
                    || mc.LAIVersion != request.LAIVersion;



                mc.LastHeartbeat = DateTime.UtcNow;
                mc.IsOnline = true;
                mc.IsApplicationRunning = request.IsApplicationRunning;
                mc.LastUpdated = DateTime.UtcNow;

                if (!string.IsNullOrWhiteSpace(request.AgentVersion))
                    mc.AgentVersion = request.AgentVersion;
                if (!string.IsNullOrWhiteSpace(request.ServiceVersion))
                    mc.ServiceVersion = request.ServiceVersion;
                if (!string.IsNullOrWhiteSpace(request.AutoUpdaterVersion))
                    mc.AutoUpdaterVersion = request.AutoUpdaterVersion;
                if (!string.IsNullOrWhiteSpace(request.LAIVersion))
                    mc.LAIVersion = request.LAIVersion;

                await _mcRepository.UpdateAsync(mc, cancellationToken);

                // Push real-time status to UI via SignalR
                if (wasOffline || wasAppNotRunning || versionChanged)
                {
                    await _hubContext.Clients.All.SendAsync("McStatusChanged", new
                    {
                        MCId = mc.MCId,
                        IsOnline = mc.IsOnline,
                        IsApplicationRunning = mc.IsApplicationRunning,
                        LastHeartbeat = mc.LastHeartbeat,
                        AgentVersion = mc.AgentVersion,
                        ServiceVersion = mc.ServiceVersion,
                        AutoUpdaterVersion = mc.AutoUpdaterVersion,
                        LAIVersion = mc.LAIVersion
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



