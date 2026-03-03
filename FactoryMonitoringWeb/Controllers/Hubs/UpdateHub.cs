using Microsoft.AspNetCore.SignalR;

namespace FactoryMonitoringWeb.Controllers.Hubs
{
    /// <summary>
    /// SignalR hub for pushing deployment status updates to browser clients.
    /// Broadcast-only — no client-to-server methods needed.
    /// 
    /// Events:
    ///   DeploymentStatusChanged  → per-MC deployment status update
    ///   ScheduleStatusChanged    → schedule-level transition (Completed/PartiallyCompleted)
    /// </summary>
    public class UpdateHub : Hub { }
}
