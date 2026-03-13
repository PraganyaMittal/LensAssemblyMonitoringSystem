using System.Text.Json;
using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Line-aware deployment orchestrator that enforces sequential MC-by-MC
    /// execution within each line, with halt-on-failure semantics.
    ///
    /// Design principles:
    /// - One active deployment per line at a time (enforced at schedule creation).
    /// - Machines are dispatched in ascending ExecutionOrder (= MCNumber).
    /// - If any MC fails, remaining MCs are marked Blocked and the schedule is Halted.
    /// - No automatic retry — only user-triggered rollback (F3).
    /// - Works for both normal deployments and rollbacks (IsRollback flag).
    /// 
    /// This service replaces the concurrent dispatch model in UpdateSchedulerService
    /// with a strictly sequential, per-line approach.
    /// </summary>
    public class LineDeploymentOrchestratorService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<LineDeploymentOrchestratorService> _logger;

        /// <summary>
        /// How often the orchestrator checks for work.
        /// </summary>
        private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(10);

        /// <summary>
        /// Max time to wait for an agent to respond after dispatch before marking Failed.
        /// </summary>
        private static readonly TimeSpan DispatchTimeout = TimeSpan.FromMinutes(5);

        /// <summary>
        /// Max time for an agent to complete download phase.
        /// </summary>
        private static readonly TimeSpan DownloadTimeout = TimeSpan.FromMinutes(30);

        /// <summary>
        /// Max time for the install + AutoUpdate cycle.
        /// </summary>
        private static readonly TimeSpan InstallTimeout = TimeSpan.FromMinutes(15);

        public LineDeploymentOrchestratorService(
            IServiceProvider serviceProvider,
            ILogger<LineDeploymentOrchestratorService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation(
                "Line Deployment Orchestrator started — tick every {Sec}s",
                TickInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessDeploymentTickAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Line Deployment Orchestrator tick failed");
                }

                await Task.Delay(TickInterval, stoppingToken);
            }
        }

        /// <summary>
        /// Main tick: activates pending schedules, advances sequential deployments,
        /// and detects timeouts.
        /// </summary>
        private async Task ProcessDeploymentTickAsync(CancellationToken ct)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

            // Step 1: Activate pending "Immediate" schedules
            await ActivatePendingSchedulesAsync(context, ct);

            // Step 2: For each InProgress schedule, advance the sequential pipeline
            await AdvanceInProgressSchedulesAsync(context, hubContext, ct);

            // Step 3: Detect timed-out deployments
            await DetectTimeoutsAsync(context, hubContext, ct);
        }

        // ────────────────────────────────────────────────────────────────
        // Step 1: Activate pending schedules
        // ────────────────────────────────────────────────────────────────

        private async Task ActivatePendingSchedulesAsync(
            FactoryDbContext context, CancellationToken ct)
        {
            var pendingSchedules = await context.UpdateSchedules
                .Where(s => s.Status == "Pending"
                         && s.IsActive
                         && (s.ScheduleType == "Immediate"
                             || (s.ScheduleType == "Scheduled"
                                 && s.ScheduledTimeUtc != null
                                 && s.ScheduledTimeUtc <= DateTime.UtcNow)))
                .ToListAsync(ct);

            foreach (var schedule in pendingSchedules)
            {
                schedule.Status = "InProgress";
                schedule.DispatchedDateUtc = DateTime.UtcNow;
                _logger.LogInformation(
                    "Schedule {Id} activated → InProgress (IsRollback={IsRollback})",
                    schedule.UpdateScheduleId, schedule.IsRollback);
            }

            if (pendingSchedules.Count > 0)
                await context.SaveChangesAsync(ct);
        }

        // ────────────────────────────────────────────────────────────────
        // Step 2: Advance each InProgress schedule sequentially
        // ────────────────────────────────────────────────────────────────

        private async Task AdvanceInProgressSchedulesAsync(
            FactoryDbContext context,
            IHubContext<AgentHub> hubContext,
            CancellationToken ct)
        {
            var activeSchedules = await context.UpdateSchedules
                .Include(s => s.UpdatePackage)
                .Include(s => s.Deployments)
                    .ThenInclude(d => d.FactoryMC)
                .Where(s => s.Status == "InProgress" && s.IsActive)
                .ToListAsync(ct);

            foreach (var schedule in activeSchedules)
            {
                await AdvanceSingleScheduleAsync(context, hubContext, schedule, ct);
            }
        }

        /// <summary>
        /// Core sequential logic for a single schedule:
        ///   1. Check if there's a currently active MC (Dispatched/Downloading/Installing).
        ///   2. If the active MC completed, move to the next one.
        ///   3. If the active MC failed, halt the entire schedule.
        ///   4. If no MC is active, dispatch the next queued one.
        ///   5. If all MCs are done, mark the schedule Completed.
        /// </summary>
        private async Task AdvanceSingleScheduleAsync(
            FactoryDbContext context,
            IHubContext<AgentHub> hubContext,
            UpdateSchedule schedule,
            CancellationToken ct)
        {
            var deployments = schedule.Deployments
                .OrderBy(d => d.ExecutionOrder)
                .ToList();

            if (deployments.Count == 0) return;

            // Check: is there an actively running deployment?
            var activeDeployment = deployments.FirstOrDefault(d =>
                d.Status is "Dispatched" or "Downloading" or "Installing");

            if (activeDeployment != null)
            {
                // An MC is currently in progress — don't dispatch the next one yet.
                // The timeout detector (Step 3) handles stuck deployments.
                return;
            }

            // Check: did the last non-queued deployment fail?
            var lastProcessed = deployments
                .Where(d => d.Status is not "Queued" and not "Blocked" and not "Skipped")
                .OrderByDescending(d => d.ExecutionOrder)
                .FirstOrDefault();

            if (lastProcessed?.Status == "Failed")
            {
                await HaltScheduleAsync(context, hubContext, schedule, lastProcessed, ct);
                return;
            }

            // Find the next queued deployment
            var nextDeployment = deployments.FirstOrDefault(d => d.Status == "Queued");

            if (nextDeployment == null)
            {
                // All deployments are done (Completed, Failed, Blocked, or Skipped)
                bool allCompleted = deployments.All(d => d.Status == "Completed");
                if (allCompleted)
                {
                    schedule.Status = "Completed";
                    schedule.CompletedDateUtc = DateTime.UtcNow;
                    await context.SaveChangesAsync(ct);

                    _logger.LogInformation(
                        "Schedule {Id} completed — all {Count} MCs deployed successfully",
                        schedule.UpdateScheduleId, deployments.Count);

                    await BroadcastScheduleStatusAsync(hubContext, schedule, ct);
                }
                return;
            }

            // Dispatch the next MC
            await DispatchToMCAsync(context, hubContext, schedule, nextDeployment, ct);
        }

        // ────────────────────────────────────────────────────────────────
        // Dispatch a single deployment to a machine's agent
        // ────────────────────────────────────────────────────────────────

        private async Task DispatchToMCAsync(
            FactoryDbContext context,
            IHubContext<AgentHub> hubContext,
            UpdateSchedule schedule,
            UpdateDeployment deployment,
            CancellationToken ct)
        {
            var package = schedule.UpdatePackage;
            var mc = deployment.FactoryMC;

            if (package == null || mc == null)
            {
                _logger.LogError(
                    "Cannot dispatch deployment {Id} — missing package or MC reference",
                    deployment.UpdateDeploymentId);
                return;
            }

            // Check if the agent is online before dispatching
            if (!mc.IsOnline)
            {
                _logger.LogWarning(
                    "MC {MCNumber} on Line {Line} is offline — marking deployment as Failed",
                    mc.MCNumber, mc.LineNumber);

                deployment.Status = "Failed";
                deployment.ErrorMessage = "Agent offline at time of dispatch";
                deployment.CompletedDateUtc = DateTime.UtcNow;
                await context.SaveChangesAsync(ct);

                // This will trigger halt on the next tick
                return;
            }

            try
            {
                // Create the agent command
                var commandData = JsonSerializer.Serialize(new
                {
                    scheduleId = schedule.UpdateScheduleId,
                    deploymentId = deployment.UpdateDeploymentId,
                    downloadUrl = $"/api/Updates/packages/{package.UpdatePackageId}/download",
                    fileHash = package.FileHash,
                    fileSize = package.FileSize,
                    version = package.Version,
                    installDir = mc.InstallDir ?? @"C:\ModalFactory\"
                });

                var agentCommand = new AgentCommand
                {
                    MCId = deployment.MCId,
                    CommandType = "DeployBundle",
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
                    "Dispatched DeployBundle to MC {MCNumber} (Line {Line}, Order {Order})",
                    mc.MCNumber, mc.LineNumber, deployment.ExecutionOrder);

                await BroadcastDeploymentStatusAsync(hubContext, deployment, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to create agent command for MC {MCId}",
                    deployment.MCId);

                deployment.Status = "Failed";
                deployment.ErrorMessage = $"Dispatch error: {ex.Message}";
                deployment.CompletedDateUtc = DateTime.UtcNow;
                await context.SaveChangesAsync(ct);
            }
        }

        // ────────────────────────────────────────────────────────────────
        // Halt: Block remaining MCs and mark schedule as Halted
        // ────────────────────────────────────────────────────────────────

        private async Task HaltScheduleAsync(
            FactoryDbContext context,
            IHubContext<AgentHub> hubContext,
            UpdateSchedule schedule,
            UpdateDeployment failedDeployment,
            CancellationToken ct)
        {
            var deployments = schedule.Deployments
                .OrderBy(d => d.ExecutionOrder)
                .ToList();

            // Block all remaining queued deployments
            foreach (var d in deployments.Where(d => d.Status == "Queued"))
            {
                d.Status = "Blocked";
            }

            // Mark schedule as halted
            schedule.Status = "Halted";
            schedule.HaltReason = $"MC #{failedDeployment.FactoryMC?.MCNumber} failed: "
                                  + (failedDeployment.ErrorMessage ?? "Unknown error");
            schedule.HaltedAtMCId = failedDeployment.MCId;

            await context.SaveChangesAsync(ct);

            _logger.LogWarning(
                "Schedule {Id} HALTED at MC {MCNumber} (Line {Line}): {Reason}",
                schedule.UpdateScheduleId,
                failedDeployment.FactoryMC?.MCNumber,
                failedDeployment.FactoryMC?.LineNumber,
                schedule.HaltReason);

            await BroadcastScheduleStatusAsync(hubContext, schedule, ct);
        }

        // ────────────────────────────────────────────────────────────────
        // Step 3: Detect timed-out deployments
        // ────────────────────────────────────────────────────────────────

        private async Task DetectTimeoutsAsync(
            FactoryDbContext context,
            IHubContext<AgentHub> hubContext,
            CancellationToken ct)
        {
            var now = DateTime.UtcNow;

            var activeDeployments = await context.UpdateDeployments
                .Include(d => d.FactoryMC)
                .Include(d => d.UpdateSchedule)
                .Where(d => d.Status == "Dispatched"
                         || d.Status == "Downloading"
                         || d.Status == "Installing")
                .Where(d => d.StartedDateUtc != null)
                .ToListAsync(ct);

            foreach (var deployment in activeDeployments)
            {
                var elapsed = now - deployment.StartedDateUtc!.Value;

                TimeSpan timeout = deployment.Status switch
                {
                    "Dispatched" => DispatchTimeout,
                    "Downloading" => DownloadTimeout,
                    "Installing" => InstallTimeout,
                    _ => DispatchTimeout
                };

                if (elapsed <= timeout) continue;

                _logger.LogWarning(
                    "Deployment {Id} to MC {MCId} timed out in '{Status}' phase " +
                    "(elapsed: {Elapsed:mm\\:ss}, timeout: {Timeout:mm\\:ss})",
                    deployment.UpdateDeploymentId,
                    deployment.MCId,
                    deployment.Status,
                    elapsed, timeout);

                deployment.Status = "Failed";
                deployment.ErrorMessage = $"Timed out in {deployment.Status} phase after {elapsed.TotalMinutes:F0} minutes";
                deployment.CompletedDateUtc = now;
                await context.SaveChangesAsync(ct);

                // The halt logic will pick this up on the next tick via AdvanceSingleScheduleAsync
            }
        }

        // ────────────────────────────────────────────────────────────────
        // SignalR Broadcast Helpers
        // ────────────────────────────────────────────────────────────────

        private static async Task BroadcastScheduleStatusAsync(
            IHubContext<AgentHub> hubContext,
            UpdateSchedule schedule,
            CancellationToken ct)
        {
            await hubContext.Clients.All.SendAsync("ScheduleStatusChanged", new
            {
                ScheduleId = schedule.UpdateScheduleId,
                schedule.Status,
                schedule.HaltReason,
                schedule.HaltedAtMCId,
                schedule.IsRollback,
                schedule.CompletedDateUtc
            }, ct);
        }

        private static async Task BroadcastDeploymentStatusAsync(
            IHubContext<AgentHub> hubContext,
            UpdateDeployment deployment,
            CancellationToken ct)
        {
            await hubContext.Clients.All.SendAsync("DeploymentStatusChanged", new
            {
                DeploymentId = deployment.UpdateDeploymentId,
                ScheduleId = deployment.UpdateScheduleId,
                deployment.MCId,
                deployment.Status,
                deployment.ExecutionOrder,
                deployment.ErrorMessage
            }, ct);
        }
    }
}
