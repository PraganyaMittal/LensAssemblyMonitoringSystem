using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Commands.Agent
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

