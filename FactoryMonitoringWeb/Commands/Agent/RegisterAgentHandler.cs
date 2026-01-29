using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Handles the RegisterAgentCommand by delegating to IAgentRegistrationService.
    /// 
    /// Design Decision: Handler is a thin orchestration layer because:
    /// 1. Single Responsibility - only coordinates, doesn't contain business logic
    /// 2. Business logic lives in service layer for reusability
    /// 3. Handler can add cross-cutting concerns (metrics, additional logging)
    /// 
    /// Pattern: Strategy Pattern - Different handlers process different command types.
    /// The CommandDispatcher selects the appropriate handler at runtime.
    /// </summary>
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

        /// <inheritdoc/>
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
                "Handling RegisterAgentCommand for Line {LineNumber}, PC {MCNumber}",
                command.Request.LineNumber,
                command.Request.MCNumber);

            // Delegate to service layer for business logic
            var result = await _registrationService.RegisterAgentAsync(
                command.Request,
                cancellationToken);

            if (result.Success)
            {
                _logger.LogInformation(
                    "Agent registration completed - PC ID {MCId}, IsNew={IsNew}",
                    result.MCId,
                    result.IsNewRegistration);
            }
            else
            {
                _logger.LogWarning(
                    "Agent registration failed - Line {LineNumber}, PC {MCNumber}: {Message}",
                    command.Request.LineNumber,
                    command.Request.MCNumber,
                    result.Message);
            }

            return result;
        }
    }
}
