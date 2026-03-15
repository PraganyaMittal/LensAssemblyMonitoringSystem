using System.Text.Json;
using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{

    public class UpdateSchedulerService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<UpdateSchedulerService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan StaleTimeout = TimeSpan.FromSeconds(120); 

        public UpdateSchedulerService(
            IServiceProvider serviceProvider,
            ILogger<UpdateSchedulerService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Dispatch Queue Engine started â€” tick every {Sec}s", CheckInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                    var agentHub = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

                    
                    await ActivateDueSchedulesAsync(context, stoppingToken);

                    
                    await DispatchQueuedDeploymentsAsync(context, agentHub, stoppingToken);

                    
                    await HandleStaleDispatchesAsync(context, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Dispatch Queue Engine error");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        
        private async Task ActivateDueSchedulesAsync(FactoryDbContext context, CancellationToken ct)
        {
            var dueSchedules = await context.UpdateSchedules
                .Where(s => s.ScheduleType == "Scheduled"
                         && s.Status == "Pending"
                         && s.ScheduledTimeUtc != null
                         && s.ScheduledTimeUtc <= DateTime.UtcNow)
                .ToListAsync(ct);

            foreach (var schedule in dueSchedules)
            {
                schedule.Status = "InProgress";
                schedule.DispatchedDateUtc = DateTime.UtcNow;
                _logger.LogInformation("Scheduled deployment {Id} activated â€” now InProgress", schedule.UpdateScheduleId);
            }

            if (dueSchedules.Any())
                await context.SaveChangesAsync(ct);
        }

        
        private async Task DispatchQueuedDeploymentsAsync(
            FactoryDbContext context, 
            IHubContext<AgentHub> agentHub,
            CancellationToken ct)
        {
            
            var maxConcurrent = 10;

            
            var activeCount = await context.UpdateDeployments
                .CountAsync(d => d.Status == "Dispatched" || d.Status == "Downloading", ct);

            var availableSlots = maxConcurrent - activeCount;
            if (availableSlots <= 0) return;

            
            
            var nextBatch = await context.UpdateDeployments
                .Include(d => d.FactoryMC)
                .Include(d => d.UpdateSchedule)
                    .ThenInclude(s => s.UpdatePackage)
                .Where(d => d.Status == "Queued"
                         && d.UpdateSchedule.Status == "InProgress"
                         && d.UpdateSchedule.IsActive)
                .OrderBy(d => d.UpdateScheduleId)  
                .ThenBy(d => d.MCId)                
                .Take(availableSlots)
                .ToListAsync(ct);

            if (!nextBatch.Any()) return;

            _logger.LogInformation(
                "Dispatching {Count} deployments (active={Active}, limit={Max})",
                nextBatch.Count, activeCount, maxConcurrent);

            foreach (var deployment in nextBatch)
            {
                var package = deployment.UpdateSchedule?.UpdatePackage;
                if (package == null) continue;

                try
                {
                    var commandType = "UpdateBundle";

                    
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

                    context.AgentCommands.Add(agentCommand);
                    await context.SaveChangesAsync(ct);

                    
                    deployment.AgentCommandId = agentCommand.CommandId;
                    deployment.Status = "Dispatched";
                    deployment.StartedDateUtc = DateTime.UtcNow;
                    deployment.AttemptCount++;
                    await context.SaveChangesAsync(ct);

                    _logger.LogInformation(
                        "Dispatched {Type} to MC {MCId} (attempt {Attempt})",
                        commandType, deployment.MCId, deployment.AttemptCount);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to dispatch deployment {Id} to MC {MCId}",
                        deployment.UpdateDeploymentId, deployment.MCId);
                }
            }
        }

        
        private async Task HandleStaleDispatchesAsync(
            FactoryDbContext context, 
            CancellationToken ct)
        {
            var cutoff = DateTime.UtcNow - StaleTimeout;

            var staleDeployments = await context.UpdateDeployments
                .Where(d => d.Status == "Dispatched"
                         && d.StartedDateUtc != null
                         && d.StartedDateUtc < cutoff)
                .ToListAsync(ct);

            foreach (var deployment in staleDeployments)
            {
                if (deployment.AttemptCount < deployment.MaxAttempts)
                {
                    
                    deployment.Status = "Queued";
                    deployment.StartedDateUtc = null;
                    _logger.LogWarning(
                        "Stale dispatch detected for MC {MCId} â€” retry {Attempt}/{Max}",
                        deployment.MCId, deployment.AttemptCount + 1, deployment.MaxAttempts);
                }
                else
                {
                    
                    deployment.Status = "Failed";
                    deployment.CompletedDateUtc = DateTime.UtcNow;
                    deployment.ErrorMessage = $"Agent unresponsive after {deployment.MaxAttempts} attempts";
                    _logger.LogError(
                        "Deployment to MC {MCId} failed â€” agent unresponsive after {Max} attempts",
                        deployment.MCId, deployment.MaxAttempts);
                }
            }

            if (staleDeployments.Any())
                await context.SaveChangesAsync(ct);
        }

    }
}

