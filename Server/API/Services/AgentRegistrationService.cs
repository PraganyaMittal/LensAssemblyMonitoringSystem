using LensAssemblyMonitoringWeb.Models.Exceptions;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Services
{

    public class AgentRegistrationService : IAgentRegistrationService
    {
        private readonly ILensAssemblyMCRepository _mcRepository;
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<AgentRegistrationService> _logger;

        public AgentRegistrationService(
            ILensAssemblyMCRepository mcRepository,
            LensAssemblyDbContext context,
            ILogger<AgentRegistrationService> logger)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

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
                var existingMC = await _mcRepository.FindByIpAsync(
                    request.IPAddress,
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
            catch (RepositoryException ex) when (ex.InnerException is DbUpdateException)
            {
                _logger.LogWarning(ex, "Registration conflict for IP {IPAddress}, Line {LineNumber}, MC {MCNumber}", request.IPAddress, request.LineNumber, request.MCNumber);
                return RegistrationResult.Failed("A machine with this Line and MC number is already registered by another device. Please check the Web Dashboard.");
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

        private async Task SaveRegistrationDataAsync(
            int mcId,
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            
            if (request.Models != null && request.Models.Count > 0)
            {
                var existingModels = await _context.Models
                    .Where(m => m.MCId == mcId)
                    .ToListAsync(cancellationToken);
                var modelNames = request.Models.Select(m => m.ModelName).ToHashSet();

                foreach (var modelInfo in request.Models)
                {
                    var existing = existingModels.FirstOrDefault(m => m.ModelName == modelInfo.ModelName);
                    if (existing == null)
                    {
                        _context.Models.Add(new Model
                        {
                            MCId = mcId,
                            ModelName = modelInfo.ModelName,
                            ModelPath = modelInfo.ModelPath,
                            IsCurrentModel = modelInfo.IsCurrent,
                            LastUsed = modelInfo.IsCurrent ? DateTime.Now : null
                        });
                    }
                    else
                    {
                        existing.ModelPath = modelInfo.ModelPath;
                        existing.IsCurrentModel = modelInfo.IsCurrent;
                        if (modelInfo.IsCurrent) existing.LastUsed = DateTime.Now;
                    }
                }

                var staleModels = existingModels.Where(m => !modelNames.Contains(m.ModelName)).ToList();
                if (staleModels.Any()) _context.Models.RemoveRange(staleModels);

                await _context.SaveChangesAsync(cancellationToken);
                _logger.LogInformation("Registration synced {Count} models for MC {MCId}", request.Models.Count, mcId);
            }
            else if (!string.IsNullOrWhiteSpace(request.CurrentModelName))
            {
                
                var existingModels = await _context.Models.Where(m => m.MCId == mcId).ToListAsync(cancellationToken);
                foreach (var m in existingModels) m.IsCurrentModel = false;

                var existingModel = existingModels.FirstOrDefault(m => m.ModelName == request.CurrentModelName);
                if (existingModel == null)
                {
                    _context.Models.Add(new Model
                    {
                        MCId = mcId,
                        ModelName = request.CurrentModelName,
                        ModelPath = request.CurrentModelPath ?? string.Empty,
                        IsCurrentModel = true,
                        LastUsed = DateTime.Now
                    });
                }
                else
                {
                    existingModel.IsCurrentModel = true;
                    existingModel.LastUsed = DateTime.Now;
                }
                await _context.SaveChangesAsync(cancellationToken);
            }

        }

        private async Task<RegistrationResult> CreateNewAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            var newMC = new LensAssemblyMC
            {
                LineNumber = request.LineNumber,
                MCNumber = request.MCNumber,
                IPAddress = request.IPAddress,
                ConfigFilePath = request.ConfigFilePath,
                LogFolderPath = request.LogFolderPath,
                ModelFolderPath = request.ModelFolderPath,
                ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion) ? "3.5" : request.ModelVersion,
                IsOnline = true,
                LastHeartbeat = DateTime.UtcNow,
                LifecycleState = "Active",
                LogStructureJson = request.LogStructureJson
            };

            var created = await _mcRepository.AddAsync(newMC, cancellationToken);

            await SaveRegistrationDataAsync(created.MCId, request, cancellationToken);

            _logger.LogInformation(
                "New agent registered - MC ID {MCId}, Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                created.MCId,
                request.LineNumber,
                request.MCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(created.MCId, created.LineNumber, created.MCNumber, isNew: true);
        }

        private async Task<RegistrationResult> UpdateExistingAgentAsync(
            LensAssemblyMC existingMC,
            AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            existingMC.LineNumber = request.LineNumber;
            existingMC.MCNumber = request.MCNumber;
            existingMC.IPAddress = request.IPAddress;
            existingMC.ConfigFilePath = request.ConfigFilePath;
            existingMC.LogFolderPath = request.LogFolderPath;
            existingMC.ModelFolderPath = request.ModelFolderPath;
            existingMC.ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion)
                ? existingMC.ModelVersion
                : request.ModelVersion;
            existingMC.IsOnline = true;
            existingMC.LastHeartbeat = DateTime.UtcNow;
            existingMC.LastUpdated = DateTime.UtcNow;
            existingMC.LifecycleState = "Active";
            existingMC.LifecycleRequestedAtUtc = null;
            existingMC.LifecycleCompletedAtUtc = null;
            existingMC.LifecycleCommandId = null;
            existingMC.LifecycleError = null;

            if (!string.IsNullOrEmpty(request.LogStructureJson))
            {
                existingMC.LogStructureJson = request.LogStructureJson;
            }

            await _mcRepository.UpdateAsync(existingMC, cancellationToken);

            await SaveRegistrationDataAsync(existingMC.MCId, request, cancellationToken);

            _logger.LogInformation(
                "Agent re-registered - MC ID {MCId}, Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                existingMC.MCId,
                request.LineNumber,
                request.MCNumber,
                request.ModelVersion);

            return RegistrationResult.Succeeded(existingMC.MCId, existingMC.LineNumber, existingMC.MCNumber, isNew: false);
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

