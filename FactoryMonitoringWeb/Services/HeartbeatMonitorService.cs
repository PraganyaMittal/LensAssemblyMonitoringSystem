using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using FactoryMonitoringWeb.Controllers.Hubs;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Background service that monitors agent heartbeats and marks PCs as offline
    /// if they haven't sent a heartbeat in the last 30 seconds
    /// </summary>
    public class HeartbeatMonitorService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<HeartbeatMonitorService> _logger;
        private readonly TimeSpan _checkInterval = TimeSpan.FromSeconds(5);
        private readonly TimeSpan _heartbeatTimeout = TimeSpan.FromSeconds(35);

        public HeartbeatMonitorService(
            IServiceProvider serviceProvider,
            ILogger<HeartbeatMonitorService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Heartbeat Monitor Service started");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await MonitorHeartbeats();
                    await Task.Delay(_checkInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    // Graceful shutdown
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in heartbeat monitoring");
                    // Add a small delay to prevent tight loop on error
                    await Task.Delay(1000, stoppingToken);
                }
            }

            _logger.LogInformation("Heartbeat Monitor Service stopped");
        }

        private async Task MonitorHeartbeats()
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<AgentHub>>();

            var cutoffTime = DateTime.UtcNow.Subtract(_heartbeatTimeout);

            // Fetch the PCs *before* updating to know which ones went offline for broadcasting
            var stalePCs = await context.FactoryMCs
                .Where(pc => pc.IsOnline &&
                            (pc.LastHeartbeat == null || pc.LastHeartbeat < cutoffTime))
                .Select(pc => pc.MCId)
                .ToListAsync();

            if (stalePCs.Any())
            {
                var updatedCount = await context.FactoryMCs
                    .Where(pc => stalePCs.Contains(pc.MCId))
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(pc => pc.IsOnline, false)
                        .SetProperty(pc => pc.IsApplicationRunning, false)
                        .SetProperty(pc => pc.LastUpdated, DateTime.UtcNow));

                _logger.LogWarning($"Marked {updatedCount} stale MC(s) as offline");

                foreach (var mcId in stalePCs)
                {
                    await hubContext.Clients.All.SendAsync("McStatusChanged", new
                    {
                        MCId = mcId,
                        IsOnline = false,
                        IsApplicationRunning = false,
                        LastHeartbeat = cutoffTime // Approximate LastHeartbeat
                    });
                }
            }
        }
    }
}

