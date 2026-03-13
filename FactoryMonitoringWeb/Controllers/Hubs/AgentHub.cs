using Microsoft.AspNetCore.SignalR;

namespace FactoryMonitoringWeb.Controllers.Hubs
{
    /// <summary>
    /// SignalR hub for real-time communication with Factory Agents.
    /// Agents register to groups by MC ID for targeted messaging.
    /// </summary>
    public class AgentHub : Hub
    {
        private readonly ILogger<AgentHub> _logger;

        public AgentHub(ILogger<AgentHub> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Agent calls this on connect to join its MC group for targeted commands.
        /// </summary>
        public async Task RegisterAgent(string MCId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, MCId);
            _logger.LogInformation("Agent registered: MCId={MCId}, ConnectionId={ConnectionId}", MCId, Context.ConnectionId);
        }

        /// <summary>
        /// Agent reports deployment status back to the server.
        /// Called by agent after executing a DeployModel/UploadModel command.
        /// </summary>
        public async Task ReportDeploymentStatus(string mcId, int commandId, string status, string checksum, string errorMessage)
        {
            _logger.LogInformation(
                "Deployment status from MC {MCId}: CommandId={CommandId}, Status={Status}",
                mcId, commandId, status);

            // Broadcast to any UI clients listening for deployment updates
            await Clients.All.SendAsync("DeploymentStatusUpdate", new
            {
                MCId = mcId,
                CommandId = commandId,
                Status = status,
                AgentChecksum = checksum,
                ErrorMessage = errorMessage,
                Timestamp = DateTime.UtcNow
            });
        }

        /// <summary>
        /// Agent reports command execution result.
        /// </summary>
        public async Task ReportCommandResult(string mcId, int commandId, string status, string resultData)
        {
            await Clients.All.SendAsync("CommandResultUpdate", new
            {
                MCId = mcId,
                CommandId = commandId,
                Status = status,
                ResultData = resultData,
                Timestamp = DateTime.UtcNow
            });
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation("Agent disconnected: ConnectionId={ConnectionId}", Context.ConnectionId);
            return base.OnDisconnectedAsync(exception);
        }
    }
}
