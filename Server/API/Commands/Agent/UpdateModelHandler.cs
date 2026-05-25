using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using LensAssemblyMonitoringWeb.Models.Exceptions;

namespace LensAssemblyMonitoringWeb.Commands.Agent
{
    public class UpdateModelHandler : ICommandHandler<UpdateModelCommand, bool>
    {
        private readonly IModelRepository _modelRepository;
        private readonly ILensAssemblyMCRepository _mcRepository;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<UpdateModelHandler> _logger;

        public UpdateModelHandler(
            IModelRepository modelRepository,
            ILensAssemblyMCRepository mcRepository,
            IHubContext<AgentHub> hubContext,
            ILogger<UpdateModelHandler> logger)
        {
            _modelRepository = modelRepository ?? throw new ArgumentNullException(nameof(modelRepository));
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<bool> HandleAsync(
            UpdateModelCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            try
            {
                var mc = await _mcRepository.GetByIdAsync(command.Request.MCId, cancellationToken);
                if (mc == null)
                {
                    throw new AgentNotFoundException(command.Request.MCId);
                }

                await _modelRepository.UpdateCurrentModelAsync(
                    command.Request.MCId,
                    command.Request.ModelName,
                    cancellationToken);

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
                    CurrentModelName = command.Request.ModelName
                }, cancellationToken);

                _logger.LogInformation("Successfully updated model for MC {MCId} to {ModelName}", command.Request.MCId, command.Request.ModelName);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update model for MC {MCId}", command.Request.MCId);
                throw;
            }
        }
    }
}
