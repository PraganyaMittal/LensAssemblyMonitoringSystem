using Microsoft.AspNetCore.SignalR;

namespace FactoryMonitoringWeb.Controllers.Hubs
{
    /// <summary>
    /// SignalR hub for real-time communication with Factory Agents.
    /// Agents register to groups by PC ID for targeted messaging.
    /// </summary>
    public class AgentHub : Hub
    {
        public async Task RegisterAgent(string pcId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, pcId);
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            return base.OnDisconnectedAsync(exception);
        }
    }
}
