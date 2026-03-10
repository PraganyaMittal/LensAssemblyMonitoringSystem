using System.Text.Json;
using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Dispatch Queue Engine — the heart of the deployment system.
    /// 
    /// Runs every 10 seconds and performs three jobs:
    /// 1. Activates "Scheduled" schedules whose time has arrived
    /// 2. Dispatches queued deployments up to MaxConcurrentDownloads
    /// 3. Detects stale dispatches (agent unresponsive) and retries or fails them
    /// 
    /// This replaces the old "fire-and-forget" dispatcher to prevent network saturation.
    /// </summary>
    public class UpdateSchedulerService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<UpdateSchedulerService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan StaleTimeout = TimeSpan.FromSeconds(120); // 2 min

        public UpdateSchedulerService(
            IServiceProvider serviceProvider,
            ILogger<UpdateSchedulerService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Dispatch Queue Engine started — tick every {Sec}s", CheckInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                    var agentHub = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

                    // Job 1: Activate due scheduled deployments
                    await ActivateDueSchedulesAsync(context, stoppingToken);

                    // Job 2: Dispatch queued deployments (respecting concurrency limit)
                    await DispatchQueuedDeploymentsAsync(context, agentHub, stoppingToken);

                    // Job 3: Detect and handle stale dispatches
                    await HandleStaleDispatchesAsync(context, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Dispatch Queue Engine error");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        // ============================================================
        // Job 1: Activate scheduled deployments whose time has arrived
        // ============================================================
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
                _logger.LogInformation("Scheduled deployment {Id} activated — now InProgress", schedule.UpdateScheduleId);
            }

            if (dueSchedules.Any())
                await context.SaveChangesAsync(ct);
        }

        // ============================================================
        // Job 2: Dispatch queued deployments up to concurrency limit
        // ============================================================
        private async Task DispatchQueuedDeploymentsAsync(
            FactoryDbContext context, 
            IHubContext<AgentHub> agentHub,
            CancellationToken ct)
        {
            // Hardcoded concurrency limit
            var maxConcurrent = 10;

            // Count deployments currently in active download states
            var activeCount = await context.UpdateDeployments
                .CountAsync(d => d.Status == "Dispatched" || d.Status == "Downloading", ct);

            var availableSlots = maxConcurrent - activeCount;
            if (availableSlots <= 0) return;

            // Get the next batch of queued deployments
            // Only from InProgress schedules (Pending = not yet activated, Cancelled = stopped)
            var nextBatch = await context.UpdateDeployments
                .Include(d => d.FactoryMC)
                .Include(d => d.UpdateSchedule)
                    .ThenInclude(s => s.UpdatePackage)
                .Where(d => d.Status == "Queued"
                         && d.UpdateSchedule.Status == "InProgress"
                         && d.UpdateSchedule.IsActive)
                .OrderBy(d => d.UpdateScheduleId)  // FIFO by schedule
                .ThenBy(d => d.MCId)                // Then by MC order
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

                    // Create AgentCommand
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

                    // Update deployment status
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

        // ============================================================
        // Job 3: Detect stale dispatches and retry or fail
        // ============================================================
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
                    // Retry: put back in queue
                    deployment.Status = "Queued";
                    deployment.StartedDateUtc = null;
                    _logger.LogWarning(
                        "Stale dispatch detected for MC {MCId} — retry {Attempt}/{Max}",
                        deployment.MCId, deployment.AttemptCount + 1, deployment.MaxAttempts);
                }
                else
                {
                    // Max retries exceeded — mark as failed
                    deployment.Status = "Failed";
                    deployment.CompletedDateUtc = DateTime.UtcNow;
                    deployment.ErrorMessage = $"Agent unresponsive after {deployment.MaxAttempts} attempts";
                    _logger.LogError(
                        "Deployment to MC {MCId} failed — agent unresponsive after {Max} attempts",
                        deployment.MCId, deployment.MaxAttempts);
                }
            }

            if (staleDeployments.Any())
                await context.SaveChangesAsync(ct);
        }

    }
}
