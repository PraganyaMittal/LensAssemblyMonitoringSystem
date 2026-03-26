using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace LensAssemblyMonitoringWeb.Controllers.Hubs
{
    public class YieldHub : Hub
    {
        public async Task BroadcastYieldUpdate(int machineId, double newYield)
        {
            await Clients.All.SendAsync("ReceiveYieldUpdate", machineId, newYield);
        }
    }
}

