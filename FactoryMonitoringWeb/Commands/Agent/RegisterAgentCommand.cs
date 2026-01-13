using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services.Interfaces;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Command to register a new agent or update an existing agent's registration.
    /// 
    /// Design Decision: Command objects are immutable data carriers because:
    /// 1. Thread safety - no shared mutable state
    /// 2. Clarity - all inputs required at construction time
    /// 3. Testability - easy to create test instances
    /// 
    /// Pattern: Command Pattern - Encapsulates a request as an object.
    /// </summary>
    public class RegisterAgentCommand : ICommand<RegistrationResult>
    {
        /// <summary>
        /// The registration request data from the agent.
        /// </summary>
        public AgentRegistrationRequest Request { get; }

        /// <summary>
        /// Creates a new registration command.
        /// </summary>
        /// <param name="request">The registration request data</param>
        public RegisterAgentCommand(AgentRegistrationRequest request)
        {
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }
    }
}
