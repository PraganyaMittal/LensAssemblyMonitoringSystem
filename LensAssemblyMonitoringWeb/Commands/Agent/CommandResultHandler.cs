using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Data.Repositories;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Commands.Agent
{

    public class CommandResultHandler : ICommandHandler<CommandResultCommand, CommandResultResponse>
    {
        private readonly IAgentCommandRepository _commandRepository;
        private readonly ILensAssemblyMCRepository _mcRepository;
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<CommandResultHandler> _logger;

        public CommandResultHandler(
            IAgentCommandRepository commandRepository,
            ILensAssemblyMCRepository mcRepository,
            LensAssemblyDbContext context,
            ILogger<CommandResultHandler> logger)
        {
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<CommandResultResponse> HandleAsync(
            CommandResultCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            _logger.LogDebug(
                "Recording command result: CommandId={CommandId}, Status={Status}",
                command.CommandId,
                command.Status);

            try
            {
                var agentCommand = await _commandRepository.GetByIdAsync(command.CommandId, cancellationToken);
                if (agentCommand == null)
                {
                    _logger.LogWarning("Command {CommandId} not found", command.CommandId);
                    return CommandResultResponse.NotFound();
                }

                agentCommand.Status = command.Status;
                agentCommand.ResultData = command.ResultData;
                agentCommand.ErrorMessage = command.ErrorMessage;
                agentCommand.ExecutedDate = DateTime.Now;

                bool agentDeleted = false;

                if (agentCommand.CommandType == "ResetAgent" && command.Status == "Completed")
                {
                    var mc = await _context.LensAssemblyMCs
                        .Include(p => p.Models)
                        .FirstOrDefaultAsync(p => p.MCId == agentCommand.MCId, cancellationToken);

                    if (mc != null)
                    {
                        _context.LensAssemblyMCs.Remove(mc);
                        agentDeleted = true;
                        _logger.LogInformation("MC {MCId} permanently deleted after ResetAgent confirmation", mc.MCId);
                    }
                }

                if (agentCommand.CommandType == "DeleteModel" && command.Status == "Completed")
                {
                    try
                    {
                        dynamic? cmdData = JsonConvert.DeserializeObject(agentCommand.CommandData);
                        string modelName = cmdData?.ModelName ?? string.Empty;

                        var modelToRemove = await _context.Models
                            .FirstOrDefaultAsync(m => m.MCId == agentCommand.MCId && m.ModelName == modelName, cancellationToken);

                        if (modelToRemove != null)
                        {
                            _context.Models.Remove(modelToRemove);
                            _logger.LogInformation(
                                "Model '{ModelName}' removed from DB for MC {MCId} following successful deletion on agent.",
                                modelName,
                                agentCommand.MCId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error cleaning up model from DB after agent deletion for Command {CommandId}", command.CommandId);
                    }
                }

                if (agentCommand.CommandType is "UpdateBundle" or "DeployBundle" or "DeployLAI" or "UpdateLAI")
                {
                    try
                        {
                        
                        var deployment = await _context.UpdateDeployments
                            .Include(d => d.LensAssemblyMC)
                            .Include(d => d.UpdateSchedule)
                                .ThenInclude(s => s.UpdatePackage)
                            .FirstOrDefaultAsync(d => d.AgentCommandId == agentCommand.CommandId, cancellationToken);

                        if (deployment != null)
                        {
                            if (command.Status == "Completed")
                            {
                                deployment.Status = "Completed";
                                deployment.CompletedDateUtc = DateTime.UtcNow;

                                if (deployment.LensAssemblyMC != null && deployment.UpdateSchedule?.UpdatePackage != null)
                                {
                                    var pkg = deployment.UpdateSchedule.UpdatePackage;
                                    if (pkg.PackageType == "Bundle")
                                    {
                                        deployment.LensAssemblyMC.AgentVersion = pkg.Version;
                                        deployment.LensAssemblyMC.ServiceVersion = pkg.Version;
                                    }
                                    else if (pkg.PackageType == "Agent")
                                    {
                                        deployment.LensAssemblyMC.AgentVersion = pkg.Version;
                                    }
                                    else if (pkg.PackageType == "LAI")
                                    {
                                        deployment.LensAssemblyMC.ServiceVersion = pkg.Version;
                                    }
                                }

                                if (deployment.LensAssemblyMC != null)
                                {
                                    deployment.ReportedAgentVersion = deployment.LensAssemblyMC.AgentVersion;
                                    deployment.ReportedServiceVersion = deployment.LensAssemblyMC.ServiceVersion;
                                    deployment.ReportedUpdaterVersion = deployment.LensAssemblyMC.AutoUpdaterVersion;
                                }

                                _logger.LogInformation(
                                    "Update deployment {DeploymentId} completed for MC {MCId}",
                                    deployment.UpdateDeploymentId, deployment.MCId);
                            }
                            else if (command.Status == "Failed")
                            {
                                deployment.AttemptCount++;
                                deployment.ErrorMessage = command.ErrorMessage;

                                if (deployment.AttemptCount >= deployment.MaxAttempts)
                                {
                                    deployment.Status = "Failed";
                                    deployment.CompletedDateUtc = DateTime.UtcNow;
                                    _logger.LogWarning(
                                        "Update deployment {DeploymentId} failed permanently for MC {MCId} after {Attempts} attempts",
                                        deployment.UpdateDeploymentId, deployment.MCId, deployment.AttemptCount);
                                }
                                else
                                {
                                    deployment.Status = "Failed";
                                    deployment.CompletedDateUtc = DateTime.UtcNow;
                                    _logger.LogWarning(
                                        "Update deployment {DeploymentId} failed for MC {MCId} (attempt {Attempt}/{Max})",
                                        deployment.UpdateDeploymentId, deployment.MCId,
                                        deployment.AttemptCount, deployment.MaxAttempts);
                                }
                            }
                            else if (command.Status == "Downloading")
                            {
                                deployment.Status = "Downloading";
                            }
                            else if (command.Status == "Installing")
                            {
                                deployment.Status = "Installing";
                            }
                            else if (command.Status == "InProgress")
                            {
                                deployment.Status = "Downloading";
                            }

                            await _context.SaveChangesAsync(cancellationToken);

                            await CheckAndCompleteScheduleAsync(deployment.UpdateScheduleId, cancellationToken);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex,
                            "Error updating deployment status for Command {CommandId}", command.CommandId);
                    }
                }

                await _context.SaveChangesAsync(cancellationToken);

                return CommandResultResponse.Succeeded(agentDeleted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to record command result for {CommandId}", command.CommandId);
                return CommandResultResponse.Failed($"Failed to record result: {ex.Message}");
            }
        }

        private async Task CheckAndCompleteScheduleAsync(int scheduleId, CancellationToken ct)
        {
            try
            {
                var schedule = await _context.UpdateSchedules
                    .Include(s => s.Deployments)
                    .FirstOrDefaultAsync(s => s.UpdateScheduleId == scheduleId, ct);

                if (schedule == null || schedule.Status == "Completed" ||
                    schedule.Status == "PartiallyCompleted" || schedule.Status == "Cancelled")
                    return;

                var terminalStatuses = new HashSet<string> { "Completed", "Failed", "Cancelled", "Skipped" };
                var allTerminal = schedule.Deployments.All(d => terminalStatuses.Contains(d.Status));

                if (!allTerminal) return;

                var completedCount = schedule.Deployments.Count(d => d.Status == "Completed");
                var totalCount = schedule.Deployments.Count;

                if (completedCount == totalCount)
                {
                    schedule.Status = "Completed";
                }
                else
                {
                    schedule.Status = "PartiallyCompleted";
                }

                schedule.CompletedDateUtc = DateTime.UtcNow;
                await _context.SaveChangesAsync(ct);

                _logger.LogInformation(
                    "Schedule {Id} â†’ {Status}: {Completed}/{Total} deployments succeeded",
                    scheduleId, schedule.Status, completedCount, totalCount);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking schedule completion for {ScheduleId}", scheduleId);
            }
        }
    }
}

