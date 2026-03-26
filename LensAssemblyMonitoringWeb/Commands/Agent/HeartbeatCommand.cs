using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Commands.Agent
{

    public class HeartbeatCommand : ICommand<HeartbeatResult>
    {

        public HeartbeatRequest Request { get; }

        public HeartbeatCommand(HeartbeatRequest request)
        {
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }
    }
}

