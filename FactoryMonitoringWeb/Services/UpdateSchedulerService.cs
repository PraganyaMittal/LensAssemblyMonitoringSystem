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
            _logger.LogInformation("Dispatch Queue Engine started - tick every {Sec}s", CheckInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                    var agentHub = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

                    // Dispatch queued deployments to agents
                    await DispatchQueuedDeploymentsAsync(context, agentHub, stoppingToken);

                    // Handle stale dispatches (retry or fail)
                    await HandleStaleDispatchesAsync(context, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Dispatch Queue Engine error");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        // Dispatch queued deployments to connected agents
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
                    var commandType = package.PackageType == "LAI" ? "DeployLAI" : "UpdateBundle";

                    object commandPayload;
                    if (package.PackageType == "LAI")
                    {
                        commandPayload = new
                        {
                            sharedPath = package.StoragePath,
                            version = package.Version,
                        };
                    }
                    else
                    {
                        commandPayload = new
                        {
                            downloadUrl = $"/api/Updates/packages/{package.UpdatePackageId}/download",
                            fileHash = package.FileHash,
                            fileSize = package.FileSize,
                            version = package.Version,
                            installDir = deployment.FactoryMC?.InstallDir ?? @"C:\ModalFactory\"
                        };
                    }

                    var commandData = JsonSerializer.Serialize(commandPayload);

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

        // Handle stale dispatches - retry or mark as failed
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
                        "Stale dispatch detected for MC {MCId} - retry {Attempt}/{Max}",
                        deployment.MCId, deployment.AttemptCount + 1, deployment.MaxAttempts);
                }
                else
                {
                    deployment.Status = "Failed";
                    deployment.CompletedDateUtc = DateTime.UtcNow;
                    deployment.ErrorMessage = $"Agent unresponsive after {deployment.MaxAttempts} attempts";
                    _logger.LogError(
                        "Deployment to MC {MCId} failed - agent unresponsive after {Max} attempts",
                        deployment.MCId, deployment.MaxAttempts);
                }
            }

            if (staleDeployments.Any())
                await context.SaveChangesAsync(ct);
        }

    }
}
