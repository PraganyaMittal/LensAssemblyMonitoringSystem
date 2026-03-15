using System.Text.Json;
using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{

    public class LineDeploymentOrchestratorService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<LineDeploymentOrchestratorService> _logger;

        private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(10);

        private static readonly TimeSpan DispatchTimeout = TimeSpan.FromMinutes(5);

        private static readonly TimeSpan DownloadTimeout = TimeSpan.FromMinutes(30);

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
                "Line Deployment Orchestrator started â€” tick every {Sec}s",
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

        private async Task ProcessDeploymentTickAsync(CancellationToken ct)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

            
            await ActivatePendingSchedulesAsync(context, ct);

            
            await AdvanceInProgressSchedulesAsync(context, hubContext, ct);

            
            await DetectTimeoutsAsync(context, hubContext, ct);
        }

        
        
        

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
                    "Schedule {Id} activated â†’ InProgress (IsRollback={IsRollback})",
                    schedule.UpdateScheduleId, schedule.IsRollback);
            }

            if (pendingSchedules.Count > 0)
                await context.SaveChangesAsync(ct);
        }

        
        
        

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

            
            var activeDeployment = deployments.FirstOrDefault(d =>
                d.Status is "Dispatched" or "Downloading" or "Installing");

            if (activeDeployment != null)
            {
                
                
                return;
            }

            
            var lastProcessed = deployments
                .Where(d => d.Status is not "Queued" and not "Blocked" and not "Skipped")
                .OrderByDescending(d => d.ExecutionOrder)
                .FirstOrDefault();

            if (lastProcessed?.Status == "Failed")
            {
                await HaltScheduleAsync(context, hubContext, schedule, lastProcessed, ct);
                return;
            }

            
            var nextDeployment = deployments.FirstOrDefault(d => d.Status == "Queued");

            if (nextDeployment == null)
            {
                
                bool allCompleted = deployments.All(d => d.Status == "Completed");
                if (allCompleted)
                {
                    schedule.Status = "Completed";
                    schedule.CompletedDateUtc = DateTime.UtcNow;
                    await context.SaveChangesAsync(ct);

                    _logger.LogInformation(
                        "Schedule {Id} completed â€” all {Count} MCs deployed successfully",
                        schedule.UpdateScheduleId, deployments.Count);

                    await BroadcastScheduleStatusAsync(hubContext, schedule, ct);
                }
                return;
            }

            
            await DispatchToMCAsync(context, hubContext, schedule, nextDeployment, ct);
        }

        
        
        

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
                    "Cannot dispatch deployment {Id} â€” missing package or MC reference",
                    deployment.UpdateDeploymentId);
                return;
            }

            
            if (!mc.IsOnline)
            {
                _logger.LogWarning(
                    "MC {MCNumber} on Line {Line} is offline â€” marking deployment as Failed",
                    mc.MCNumber, mc.LineNumber);

                deployment.Status = "Failed";
                deployment.ErrorMessage = "Agent offline at time of dispatch";
                deployment.CompletedDateUtc = DateTime.UtcNow;
                await context.SaveChangesAsync(ct);

                
                return;
            }

            try
            {
                
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

            
            foreach (var d in deployments.Where(d => d.Status == "Queued"))
            {
                d.Status = "Blocked";
            }

            
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

                
            }
        }

        
        
        

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

