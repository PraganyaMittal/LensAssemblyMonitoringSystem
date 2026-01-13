using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services.Interfaces;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Command to process an agent heartbeat.
    /// 
    /// Design Decision: Immutable command object because:
    /// 1. Thread safety for concurrent heartbeat processing
    /// 2. No shared mutable state between requests
    /// 3. Clear data flow from controller to handler
    /// </summary>
    public class HeartbeatCommand : ICommand<HeartbeatResult>
    {
        /// <summary>
        /// The heartbeat request data from the agent.
        /// </summary>
        public HeartbeatRequest Request { get; }

        /// <summary>
        /// Creates a new heartbeat command.
        /// </summary>
        /// <param name="request">The heartbeat request data</param>
        public HeartbeatCommand(HeartbeatRequest request)
        {
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }
    }
}
