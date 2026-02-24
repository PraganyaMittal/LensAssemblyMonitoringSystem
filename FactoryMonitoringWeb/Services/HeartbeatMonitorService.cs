using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;

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
        private readonly TimeSpan _heartbeatTimeout = TimeSpan.FromSeconds(30);

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

            var cutoffTime = DateTime.Now.Subtract(_heartbeatTimeout);

            // Find all PCs that are marked online but haven't sent heartbeat recently
            var staleHeartbeats = await context.FactoryMCs
                .Where(pc => pc.IsOnline &&
                            (pc.LastHeartbeat == null || pc.LastHeartbeat < cutoffTime))
                .ToListAsync();

            if (staleHeartbeats.Any())
            {
                foreach (var pc in staleHeartbeats)
                {
                    pc.IsOnline = false;
                    pc.IsApplicationRunning = false;
                    pc.LastUpdated = DateTime.Now;

                    _logger.LogWarning(
                        $"Marking MC offline - Line {pc.LineNumber}, MC {pc.MCNumber} " +
                        $"(Last heartbeat: {pc.LastHeartbeat?.ToString("yyyy-MM-dd HH:mm:ss") ?? "Never"})");
                }

                await context.SaveChangesAsync();

                _logger.LogInformation($"Marked {staleHeartbeats.Count} MC(s) as offline");
            }
        }
    }
}

