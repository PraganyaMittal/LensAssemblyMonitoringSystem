using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Data.Repositories;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace FactoryMonitoringWeb.Services
{
    public class CommandDeliveryService : ICommandDeliveryService
    {
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<CommandDeliveryService> _logger;

        public CommandDeliveryService(
            IAgentCommandRepository commandRepository,
            IHubContext<AgentHub> hubContext,
            ILogger<CommandDeliveryService> logger)
        {
            _commandRepository = commandRepository;
            _hubContext = hubContext;
            _logger = logger;
        }

        public async Task<int> SendCommandAsync(int mcId, string commandType, string? commandData = null)
        {
            // 1. Create and save the command to the database (Fallback mechanism)
            var command = new AgentCommand
            {
                MCId = mcId,
                CommandType = commandType,
                CommandData = commandData,
                Status = "Pending",
                CreatedDate = DateTime.UtcNow // Standardized on UTC
            };

            await _commandRepository.AddAsync(command);

            _logger.LogInformation("Queued {CommandType} command {CommandId} for MC {MCId}",
                commandType, command.CommandId, mcId);

            // 2. Attempt push delivery via SignalR
            var groupName = $"MC_{mcId}";
            try
            {
                var commandPayload = new
                {
                    commandId = command.CommandId,
                    commandType = command.CommandType,
                    commandData = command.CommandData
                };

                // Add timeout to prevent hanging if agent is mostly disconnected
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _hubContext.Clients.Group(groupName).SendAsync("ReceiveCommand", commandPayload, cts.Token);
                
                _logger.LogInformation("Pushed {CommandType} command {CommandId} to MC {MCId} via SignalR", 
                    commandType, command.CommandId, mcId);
            }
            catch (Exception ex)
            {
                // We don't fail the API call if SignalR fails, because the agent will pick it up on next heartbeat
                _logger.LogWarning(ex, "Failed to push {CommandType} command {CommandId} to MC {MCId} via SignalR. It will be delivered on next heartbeat.", 
                    commandType, command.CommandId, mcId);
            }

            return command.CommandId;
        }
    }
}
