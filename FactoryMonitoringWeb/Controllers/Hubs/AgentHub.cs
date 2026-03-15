using Microsoft.AspNetCore.SignalR;

namespace FactoryMonitoringWeb.Controllers.Hubs
{

    public class AgentHub : Hub
    {
        private readonly ILogger<AgentHub> _logger;

        public AgentHub(ILogger<AgentHub> logger)
        {
            _logger = logger;
        }

        public async Task RegisterAgent(string MCId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, MCId);
            _logger.LogInformation("Agent registered: MCId={MCId}, ConnectionId={ConnectionId}", MCId, Context.ConnectionId);
        }

        public async Task ReportDeploymentStatus(string mcId, int commandId, string status, string checksum, string errorMessage)
        {
            _logger.LogInformation(
                "Deployment status from MC {MCId}: CommandId={CommandId}, Status={Status}",
                mcId, commandId, status);

            
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

