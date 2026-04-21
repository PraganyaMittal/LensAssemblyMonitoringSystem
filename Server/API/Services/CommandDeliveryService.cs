using LensAssemblyMonitoringWeb.Controllers.Hubs;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Data.Repositories;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace LensAssemblyMonitoringWeb.Services
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
            
            var command = new AgentCommand
            {
                MCId = mcId,
                CommandType = commandType,
                CommandData = commandData,
                Status = "Pending",
                CreatedDate = DateTime.UtcNow 
            };

            await _commandRepository.AddAsync(command);

            _logger.LogInformation("Queued {CommandType} command {CommandId} for MC {MCId}",
                commandType, command.CommandId, mcId);

            var groupName = mcId.ToString();
            try
            {

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _hubContext.Clients.Group(groupName)
                    .SendAsync("ReceiveCommand",
                        command.CommandType,
                        command.CommandData ?? "",
                        command.CommandId.ToString(),
                        cts.Token);

                command.Status = "Delivered";
                command.ExecutedDate = DateTime.UtcNow;
                await _commandRepository.UpdateAsync(command);

                _logger.LogInformation("Pushed {CommandType} command {CommandId} to MC {MCId} via SignalR", 
                    commandType, command.CommandId, mcId);
            }
            catch (Exception ex)
            {
                
                _logger.LogWarning(ex, "Failed to push {CommandType} command {CommandId} to MC {MCId} via SignalR. It will be delivered on next heartbeat.", 
                    commandType, command.CommandId, mcId);
            }

            return command.CommandId;
        }
    }
}

