using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Commands.Agent
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

