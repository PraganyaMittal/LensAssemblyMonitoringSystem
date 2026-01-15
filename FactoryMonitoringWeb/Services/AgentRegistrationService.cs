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
        private readonly IFactoryPCRepository _pcRepository;
        private readonly ILogger<AgentRegistrationService> _logger;

        public AgentRegistrationService(
            IFactoryPCRepository pcRepository,
            ILogger<AgentRegistrationService> logger)
        {
            _pcRepository = pcRepository ?? throw new ArgumentNullException(nameof(pcRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <inheritdoc/>
        public async Task<RegistrationResult> RegisterAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken = default)
        {
            // Input validation (defensive programming)
            ValidateRequest(request);

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogInformation(
                "Processing agent registration - Line {LineNumber}, PC {PCNumber}, Version {ModelVersion}",
                request.LineNumber,
                request.PCNumber,
                request.ModelVersion);

            try
            {
                // Check if agent already exists (business key: Line + PC + Version)
                var existingPC = await _pcRepository.FindByLineAndPCAsync(
                    request.LineNumber,
                    request.PCNumber,
                    request.ModelVersion,
                    cancellationToken);

                if (existingPC == null)
                {
                    // New registration
                    return await CreateNewAgentAsync(request, cancellationToken);
                }
                else
                {
                    // Re-registration (update existing)
                    return await UpdateExistingAgentAsync(existingPC, request, cancellationToken);
                }
            }
            catch (RepositoryException)
            {
                // Re-throw repository exceptions as-is (already wrapped)
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Unexpected error during agent registration - Line {LineNumber}, PC {PCNumber}",
                    request.LineNumber,
                    request.PCNumber);

                throw new RegistrationFailedException(
                    request.LineNumber,
                    request.PCNumber,
                    request.ModelVersion,
                    ex.Message,
                    correlationId,
                    ex);
            }
        }

        /// <summary>
        /// Creates a new agent registration.
        /// </summary>
        private async Task<RegistrationResult> CreateNewAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            var newPC = new FactoryPC
            {
                LineNumber = request.LineNumber,
                PCNumber = request.PCNumber,
                IPAddress = request.IPAddress,
                ConfigFilePath = request.ConfigFilePath,
                LogFolderPath = request.LogFolderPath,
                ModelFolderPath = request.ModelFolderPath,
                ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion) ? "3.5" : request.ModelVersion,
                IsOnline = true,
                LastHeartbeat = DateTime.Now,
                LogStructureJson = request.LogStructureJson
            };

            var created = await _pcRepository.AddAsync(newPC, cancellationToken);

            _logger.LogInformation(
                "New agent registered - PC ID {PCId}, Line {LineNumber}, PC {PCNumber}, Version {ModelVersion}",
                created.PCId,
                request.LineNumber,
                request.PCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(created.PCId, isNew: true);
        }

        /// <summary>
        /// Updates an existing agent registration.
        /// </summary>
        private async Task<RegistrationResult> UpdateExistingAgentAsync(
            FactoryPC existingPC,
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            // Update properties
            existingPC.IPAddress = request.IPAddress;
            existingPC.ConfigFilePath = request.ConfigFilePath;
            existingPC.LogFolderPath = request.LogFolderPath;
            existingPC.ModelFolderPath = request.ModelFolderPath;
            existingPC.ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion)
                ? existingPC.ModelVersion
                : request.ModelVersion;
            existingPC.IsOnline = true;
            existingPC.LastHeartbeat = DateTime.Now;
            existingPC.LastUpdated = DateTime.Now;

            if (!string.IsNullOrEmpty(request.LogStructureJson))
            {
                existingPC.LogStructureJson = request.LogStructureJson;
            }

            await _pcRepository.UpdateAsync(existingPC, cancellationToken);

            _logger.LogInformation(
                "Agent re-registered - PC ID {PCId}, Line {LineNumber}, PC {PCNumber}, Version {ModelVersion}",
                existingPC.PCId,
                request.LineNumber,
                request.PCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(existingPC.PCId, isNew: false);
        }

        /// <summary>
        /// Validates registration request and throws DomainValidationException if invalid.
        /// </summary>
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

            if (request.PCNumber < 1 || request.PCNumber > 10000)
            {
                errors["PCNumber"] = new[] { "PC number must be between 1 and 10000" };
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
