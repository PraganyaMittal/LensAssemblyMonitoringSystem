using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Commands.Agent
{

    public class RegisterAgentCommand : ICommand<RegistrationResult>
    {

        public AgentRegistrationRequest Request { get; }

        public RegisterAgentCommand(AgentRegistrationRequest request)
        {
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }
    }
}

