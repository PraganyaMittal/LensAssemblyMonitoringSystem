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
            // Group name must match what the agent registers with in AgentHub.RegisterAgent (just the mcId number)
            var groupName = mcId.ToString();
            try
            {
                // Agent expects 3 separate string arguments: commandType, commandData, commandId
                // (see WebSocketClient.cpp ProcessMessage — args[0]=cmd, args[1]=payload, args[2]=requestId)
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _hubContext.Clients.Group(groupName)
                    .SendAsync("ReceiveCommand",
                        command.CommandType,
                        command.CommandData ?? "",
                        command.CommandId.ToString(),
                        cts.Token);
                
                // Mark as Delivered so heartbeat won't re-deliver (prevents duplicate execution)
                command.Status = "Delivered";
                command.ExecutedDate = DateTime.UtcNow;
                await _commandRepository.UpdateAsync(command);

                _logger.LogInformation("Pushed {CommandType} command {CommandId} to MC {MCId} via SignalR", 
                    commandType, command.CommandId, mcId);
            }
            catch (Exception ex)
            {
                // Command stays "Pending" — heartbeat will pick it up on next cycle
                _logger.LogWarning(ex, "Failed to push {CommandType} command {CommandId} to MC {MCId} via SignalR. It will be delivered on next heartbeat.", 
                    commandType, command.CommandId, mcId);
            }

            return command.CommandId;
        }
    }
}
