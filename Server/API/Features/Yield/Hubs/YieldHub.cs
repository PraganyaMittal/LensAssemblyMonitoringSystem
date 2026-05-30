using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace LensAssemblyMonitoringWeb.Features.Yield.Hubs
{
    public class YieldHub : Hub
    {
        public async Task BroadcastYieldUpdate(int machineId, double newYield)
        {
            await Clients.All.SendAsync("ReceiveYieldUpdate", machineId, newYield);
        }
    }
}



