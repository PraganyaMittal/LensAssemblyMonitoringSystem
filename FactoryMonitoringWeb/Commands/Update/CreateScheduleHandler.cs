using System.Text.Json;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Commands.Update
{

    public class CreateScheduleHandler : ICommandHandler<CreateScheduleCommand, CreateScheduleResult>
    {
        private readonly FactoryDbContext _context;
        private readonly IHubContext<AgentHub> _agentHub;
        private readonly ILogger<CreateScheduleHandler> _logger;
        private readonly ILAIService _laiService;

        private const int WaveSize = 20;

        public CreateScheduleHandler(
            FactoryDbContext context,
            IHubContext<AgentHub> agentHub,
            ILAIService laiService,
            ILogger<CreateScheduleHandler> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _agentHub = agentHub ?? throw new ArgumentNullException(nameof(agentHub));
            _laiService = laiService ?? throw new ArgumentNullException(nameof(laiService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<CreateScheduleResult> HandleAsync(
            CreateScheduleCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
                throw new ArgumentNullException(nameof(command));

            try
            {
                
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == command.PackageId && p.IsActive,
                        cancellationToken);

                if (package == null)
                {
                    _logger.LogWarning("Package {PackageId} not found or inactive", command.PackageId);
                    return CreateScheduleResult.PackageNotFound();
                }

                if (package.PackageType == "LAI")
                {
                    _logger.LogInformation("Validating LAI package at {Path} before scheduling", package.StoragePath);
                    var scanResult = await _laiService.ScanReleaseAsync(package.StoragePath, cancellationToken);
                    if (!scanResult.Success)
                    {
                        _logger.LogWarning("LAI package validation failed: {Error}", scanResult.ErrorMessage);
                        return CreateScheduleResult.Failed($"Shared path validation failed: {scanResult.ErrorMessage}");
                    }
                }

                
                var targetMCs = await ResolveTargetsAsync(command.TargetType, command.TargetFilter, cancellationToken);

                if (!targetMCs.Any())
                {
                    _logger.LogWarning("No MCs resolved for TargetType={Type}, Filter={Filter}",
                        command.TargetType, command.TargetFilter);
                    return CreateScheduleResult.NoTargetsResolved();
                }

                
                using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

                var schedule = new UpdateSchedule
                {
                    UpdatePackageId = command.PackageId,
                    ScheduleName = command.ScheduleName,
                    TargetType = command.TargetType,
                    TargetFilter = command.TargetFilter,
                    ScheduleType = "Immediate",
                    Status = "Pending",
                    TotalTargetCount = targetMCs.Count,
                    CreatedBy = command.CreatedBy,
                    CreatedDateUtc = DateTime.UtcNow,
                    IsActive = true
                };

                _context.UpdateSchedules.Add(schedule);
                await _context.SaveChangesAsync(cancellationToken);

                
                // Enforce strict sequential order by sorting MCs before creating deployments
                var sortedTargetMCs = targetMCs.OrderBy(mc => mc.LineNumber).ThenBy(mc => mc.MCNumber).ToList();

                var deployments = sortedTargetMCs.Select((mc, index) => new UpdateDeployment
                {
                    UpdateScheduleId = schedule.UpdateScheduleId,
                    MCId = mc.MCId,
                    Status = "Queued",
                    AttemptCount = 0,
                    MaxAttempts = 3,
                    PreviousVersion = mc.ModelVersion,
                    ExecutionOrder = index + 1 // Starts at 1, increasing order
                }).ToList();

                _context.UpdateDeployments.AddRange(deployments);
                await _context.SaveChangesAsync(cancellationToken);

                await transaction.CommitAsync(cancellationToken);

                _logger.LogInformation(
                    "Schedule created: Id={Id}, {Name}, {Count} MCs (Immediate)",
                    schedule.UpdateScheduleId, command.ScheduleName,
                    targetMCs.Count);

                
                
                
                schedule.Status = "InProgress";
                schedule.DispatchedDateUtc = DateTime.UtcNow;
                await _context.SaveChangesAsync(cancellationToken);

                return CreateScheduleResult.Succeeded(schedule.UpdateScheduleId, targetMCs.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create schedule for package {PackageId}", command.PackageId);
                return CreateScheduleResult.Failed($"Schedule creation failed: {ex.Message}");
            }
        }

        private async Task<List<FactoryMC>> ResolveTargetsAsync(
            string targetType, string? targetFilter, CancellationToken ct)
        {
            IQueryable<FactoryMC> query = _context.FactoryMCs;

            switch (targetType)
            {
                case "All":
                    break;

                case "ByVersion":
                    {
                        var filter = JsonSerializer.Deserialize<VersionFilter>(targetFilter ?? "{}");
                        if (!string.IsNullOrEmpty(filter?.Version))
                            query = query.Where(mc => mc.ModelVersion == filter.Version);
                        break;
                    }

                case "ByLine":
                    {
                        var filter = JsonSerializer.Deserialize<LineFilter>(targetFilter ?? "{}");
                        if (filter?.LineNumbers?.Any() == true)
                            query = query.Where(mc => filter.LineNumbers.Contains(mc.LineNumber));
                        break;
                    }

                case "SelectedMCs":
                    {
                        var filter = JsonSerializer.Deserialize<MCFilter>(targetFilter ?? "{}");
                        if (filter?.McIds?.Any() == true)
                            query = query.Where(mc => filter.McIds.Contains(mc.MCId));
                        break;
                    }
            }

            return await query.ToListAsync(ct);
        }

        internal async Task DispatchScheduleAsync(
            int scheduleId, UpdatePackage package, CancellationToken ct)
        {
            var schedule = await _context.UpdateSchedules
                .FirstOrDefaultAsync(s => s.UpdateScheduleId == scheduleId, ct);

            if (schedule == null) return;

            schedule.Status = "Dispatching";
            schedule.DispatchedDateUtc = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);

            var deployments = await _context.UpdateDeployments
                .Include(d => d.FactoryMC)
                .Where(d => d.UpdateScheduleId == scheduleId && d.Status == "Queued")
                .ToListAsync(ct);

            
            var waves = deployments
                .Select((d, i) => new { Deployment = d, WaveIndex = i / WaveSize })
                .GroupBy(x => x.WaveIndex);

            var commandType = "UpdateBundle";

            foreach (var wave in waves)
            {
                foreach (var item in wave)
                {
                    var deployment = item.Deployment;

                    
                    var commandData = JsonSerializer.Serialize(new
                    {
                        downloadUrl = $"/api/Updates/packages/{package.UpdatePackageId}/download",
                        fileHash = package.FileHash,
                        fileSize = package.FileSize,
                        version = package.Version,
                        installDir = deployment.FactoryMC?.InstallDir ?? @"C:\ModalFactory\"
                    });

                    var agentCommand = new AgentCommand
                    {
                        MCId = deployment.MCId,
                        CommandType = commandType,
                        CommandData = commandData,
                        Status = "Pending",
                        CreatedDate = DateTime.Now
                    };

                    _context.AgentCommands.Add(agentCommand);
                    await _context.SaveChangesAsync(ct);

                    
                    deployment.AgentCommandId = agentCommand.CommandId;
                    deployment.Status = "Dispatched";
                    deployment.StartedDateUtc = DateTime.UtcNow;
                    await _context.SaveChangesAsync(ct);

                    
                    try
                    {
                        await _agentHub.Clients
                            .Group(deployment.MCId.ToString())
                            .SendAsync("ReceiveCommand",
                                commandType,
                                commandData,
                                agentCommand.CommandId.ToString(), ct);

                        _logger.LogInformation(
                            "Dispatched {Type} to MC {MCId}, CommandId={CmdId}",
                            commandType, deployment.MCId, agentCommand.CommandId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "SignalR push failed for MC {MCId} â€” agent will pick up via heartbeat",
                            deployment.MCId);
                    }
                }
            }

            
            schedule.Status = "InProgress";
            await _context.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Schedule {Id} dispatched: {Count} MCs",
                scheduleId, deployments.Count);
        }

        
        private class VersionFilter
        {
            public string? Version { get; set; }
        }

        private class LineFilter
        {
            public List<int>? LineNumbers { get; set; }
        }

        private class MCFilter
        {
            public List<int>? McIds { get; set; }
        }
    }
}

