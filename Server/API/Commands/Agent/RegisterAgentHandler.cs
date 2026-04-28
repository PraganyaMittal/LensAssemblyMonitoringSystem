using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Commands.Agent
{
    public class RegisterAgentHandler : ICommandHandler<RegisterAgentCommand, RegistrationResult>
    {
        private readonly IAgentRegistrationService _registrationService;
        private readonly ILogger<RegisterAgentHandler> _logger;

        public RegisterAgentHandler(
            IAgentRegistrationService registrationService,
            ILogger<RegisterAgentHandler> logger)
        {
            _registrationService = registrationService ?? throw new ArgumentNullException(nameof(registrationService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<RegistrationResult> HandleAsync(
            RegisterAgentCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Handling RegisterAgentCommand for Line {LineNumber}, MC {MCNumber}",
                command.Request.LineNumber,
                command.Request.MCNumber);

            var result = await _registrationService.RegisterAgentAsync(
                command.Request,
                cancellationToken);

            if (result.Success)
            {
                _logger.LogInformation(
                    "Agent registration completed - MC ID {MCId}, IsNew={IsNew}",
                    result.MCId,
                    result.IsNewRegistration);
            }
            else
            {
                _logger.LogWarning(
                    "Agent registration failed - Line {LineNumber}, MC {MCNumber}: {Message}",
                    command.Request.LineNumber,
                    command.Request.MCNumber,
                    result.Message);
            }

            return result;
        }
    }
}

