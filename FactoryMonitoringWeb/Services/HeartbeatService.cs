using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.SignalR;
using FactoryMonitoringWeb.Controllers.Hubs;

namespace FactoryMonitoringWeb.Services
{

    public class HeartbeatService : IHeartbeatService
    {
        private readonly IFactoryMCRepository _mcRepository;
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IModelRepository _modelRepository;
        private readonly ILogger<HeartbeatService> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        private static readonly string[] ExcludedCommandTypes = { "GetLogFileContent" };

        public HeartbeatService(
            IFactoryMCRepository mcRepository,
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

                bool wasOffline = !mc.IsOnline;
                bool wasAppNotRunning = mc.IsApplicationRunning != request.IsApplicationRunning;

                
                bool versionChanged = mc.AgentVersion != request.AgentVersion
                    || mc.ServiceVersion != request.ServiceVersion
                    || mc.AutoUpdaterVersion != request.AutoUpdaterVersion
                    || mc.LAIVersion != request.LAIVersion;

                bool ipcChanged = mc.IpcConnected != (request.IpcConnected ?? false)
                    || mc.IpcLastPingMs != request.IpcLastPingMs;

                
                mc.LastHeartbeat = DateTime.Now;
                mc.IsOnline = true;
                mc.IsApplicationRunning = request.IsApplicationRunning;
                mc.LastUpdated = DateTime.Now;

                
                if (request.AgentVersion != null)
                    mc.AgentVersion = request.AgentVersion;
                if (request.ServiceVersion != null)
                    mc.ServiceVersion = request.ServiceVersion;
                if (request.AutoUpdaterVersion != null)
                    mc.AutoUpdaterVersion = request.AutoUpdaterVersion;
                if (request.LAIVersion != null)
                    mc.LAIVersion = request.LAIVersion;

                
                if (request.IpcConnected.HasValue)
                    mc.IpcConnected = request.IpcConnected.Value;
                if (request.IpcLastPingMs.HasValue)
                    mc.IpcLastPingMs = request.IpcLastPingMs.Value;

                await _mcRepository.UpdateAsync(mc, cancellationToken);

                
                if (wasOffline || wasAppNotRunning || versionChanged || ipcChanged)
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
                        LAIVersion = mc.LAIVersion,
                        IpcConnected = mc.IpcConnected,
                        IpcLastPingMs = mc.IpcLastPingMs
                    }, cancellationToken);
                }

                
                
                
                if (request.CurrentModelName != null)
                {
                    await _modelRepository.UpdateCurrentModelAsync(
                        mc.MCId, request.CurrentModelName, cancellationToken);
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

