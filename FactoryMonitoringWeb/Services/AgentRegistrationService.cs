using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Implementation of agent registration business logic.
    /// 
    /// Design Decision: Depends on repository abstraction (DIP) because:
    /// 1. High-level business logic doesn't depend on low-level EF Core
    /// 2. Repository can be mocked for unit testing
    /// 3. Easy to swap implementations (e.g., for caching layer)
    /// 
    /// All operations are logged with correlation IDs for distributed tracing.
    /// </summary>
    public class AgentRegistrationService : IAgentRegistrationService
    {
        private readonly IFactoryMCRepository _mcRepository;
        private readonly ILogger<AgentRegistrationService> _logger;

        public AgentRegistrationService(
            IFactoryMCRepository mcRepository,
            ILogger<AgentRegistrationService> logger)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <inheritdoc/>
        public async Task<RegistrationResult> RegisterAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken = default)
        {
            ValidateRequest(request);

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogInformation(
                "Processing agent registration - Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                request.LineNumber,
                request.MCNumber,
                request.ModelVersion);

            try
            {
                var existingMC = await _mcRepository.FindByLineAndMCAsync(
                    request.LineNumber,
                    request.MCNumber,
                    request.ModelVersion,
                    cancellationToken);

                if (existingMC == null)
                {
                    return await CreateNewAgentAsync(request, cancellationToken);
                }
                else
                {
                    return await UpdateExistingAgentAsync(existingMC, request, cancellationToken);
                }
            }
            catch (RepositoryException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Unexpected error during agent registration - Line {LineNumber}, MC {MCNumber}",
                    request.LineNumber,
                    request.MCNumber);

                throw new RegistrationFailedException(
                    request.LineNumber,
                    request.MCNumber,
                    request.ModelVersion,
                    ex.Message,
                    correlationId,
                    ex);
            }
        }

        private async Task<RegistrationResult> CreateNewAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            var newMC = new FactoryMC
            {
                LineNumber = request.LineNumber,
                MCNumber = request.MCNumber,
                IPAddress = request.IPAddress,
                ConfigFilePath = request.ConfigFilePath,
                LogFolderPath = request.LogFolderPath,
                ModelFolderPath = request.ModelFolderPath,
                ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion) ? "3.5" : request.ModelVersion,
                IsOnline = true,
                LastHeartbeat = DateTime.Now,
                LogStructureJson = request.LogStructureJson
            };

            var created = await _mcRepository.AddAsync(newMC, cancellationToken);

            _logger.LogInformation(
                "New agent registered - MC ID {MCId}, Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                created.MCId,
                request.LineNumber,
                request.MCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(created.MCId, isNew: true);
        }

        private async Task<RegistrationResult> UpdateExistingAgentAsync(
            FactoryMC existingMC,
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            existingMC.IPAddress = request.IPAddress;
            existingMC.ConfigFilePath = request.ConfigFilePath;
            existingMC.LogFolderPath = request.LogFolderPath;
            existingMC.ModelFolderPath = request.ModelFolderPath;
            existingMC.ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion)
                ? existingMC.ModelVersion
                : request.ModelVersion;
            existingMC.IsOnline = true;
            existingMC.LastHeartbeat = DateTime.Now;
            existingMC.LastUpdated = DateTime.Now;

            if (!string.IsNullOrEmpty(request.LogStructureJson))
            {
                existingMC.LogStructureJson = request.LogStructureJson;
            }

            await _mcRepository.UpdateAsync(existingMC, cancellationToken);

            _logger.LogInformation(
                "Agent re-registered - MC ID {MCId}, Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                existingMC.MCId,
                request.LineNumber,
                request.MCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(existingMC.MCId, isNew: false);
        }

        private void ValidateRequest(AgentRegistrationRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            var errors = new Dictionary<string, string[]>();

            if (request.LineNumber < 1 || request.LineNumber > 1000)
            {
                errors["LineNumber"] = new[] { "Line number must be between 1 and 1000" };
            }

            if (request.MCNumber < 1 || request.MCNumber > 10000)
            {
                errors["MCNumber"] = new[] { "MC number must be between 1 and 10000" };
            }

            if (string.IsNullOrWhiteSpace(request.IPAddress))
            {
                errors["IPAddress"] = new[] { "IP address is required" };
            }

            if (string.IsNullOrWhiteSpace(request.ConfigFilePath))
            {
                errors["ConfigFilePath"] = new[] { "Config file path is required" };
            }

            if (string.IsNullOrWhiteSpace(request.LogFolderPath))
            {
                errors["LogFolderPath"] = new[] { "Log folder path is required" };
            }

            if (errors.Any())
            {
                throw new DomainValidationException(errors, CorrelationContext.CorrelationId);
            }
        }
    }
}
