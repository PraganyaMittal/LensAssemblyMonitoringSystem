using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.Configuration;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace FactoryMonitoringWeb.Services
{
    public interface IYieldAlertService
    {
        Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield, DateTime? dateStart, DateTime? dateEnd);
        Task<YieldAlertSettings> GetSettings();
        Task UpdateSettings(YieldAlertSettings settings);
        Task DeleteAlert(int id);
        Task ClearAllAlerts();
    }

    public class YieldAlertService : IYieldAlertService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHubContext<YieldHub> _hubContext;
        private readonly string _settingsPath;
        private YieldAlertSettings _cachedSettings;

        private readonly ILogger<YieldAlertService> _logger;

        public YieldAlertService(IServiceScopeFactory scopeFactory, IHubContext<YieldHub> hubContext, IWebHostEnvironment env, ILogger<YieldAlertService> logger)
        {
            _scopeFactory = scopeFactory;
            _hubContext = hubContext;
            _settingsPath = Path.Combine(env.ContentRootPath, "Data", "alert_settings.json");
            _logger = logger;
            _cachedSettings = LoadSettings();
        }

        private YieldAlertSettings LoadSettings()
        {
            if (File.Exists(_settingsPath))
            {
                try
                {
                    var json = File.ReadAllText(_settingsPath);
                    return JsonSerializer.Deserialize<YieldAlertSettings>(json) ?? new YieldAlertSettings();
                }
                catch { }
            }
            return new YieldAlertSettings();
        }

        public Task<YieldAlertSettings> GetSettings()
        {
            return Task.FromResult(_cachedSettings);
        }

        public async Task UpdateSettings(YieldAlertSettings settings)
        {
            _cachedSettings = settings;
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(_settingsPath, json);
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<int, SemaphoreSlim> _locks = new();

        public async Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield, DateTime? dateStart, DateTime? dateEnd)
        {
            // Get or create lock for this specific machine
            var machineLock = _locks.GetOrAdd(machineId, _ => new SemaphoreSlim(1, 1));

            // Wait for lock to ensure only one check per machine happens at a time
            await machineLock.WaitAsync();

            try
            {
                using (var scope = _scopeFactory.CreateScope())
                {
                    var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                    
                    // Check if alert condition met
                    _logger.LogInformation("Checking Yield: MC={MCId}, Cur={Cur}, Thresh={Thresh}", machineId, currentYield, _cachedSettings.Threshold);

                    if (currentYield < _cachedSettings.Threshold)
                    {
                        // Check for existing active alert
                        var activeAlert = await context.YieldAlerts
                            .Where(a => a.MachineId == machineId && a.IsActive)
                            .FirstOrDefaultAsync();

                        if (activeAlert == null)
                        {
                            // Check cooldown: any alert (active or resolved) in last X minutes?
                            var cooldownTime = DateTime.Now.AddMinutes(-_cachedSettings.CooldownMinutes);
                            var recentAlert = await context.YieldAlerts
                                .Where(a => a.MachineId == machineId && a.CreatedAt >= cooldownTime)
                                .OrderByDescending(a => a.CreatedAt)
                                .FirstOrDefaultAsync();

                            if (recentAlert == null)
                            {
                                // Create NEW Alert
                                var newAlert = new YieldAlert
                                {
                                    MachineId = machineId,
                                    MachineName = machineName,
                                    LineNumber = lineNumber,
                                    CurrentYield = currentYield,
                                    Threshold = _cachedSettings.Threshold,
                                    CreatedAt = DateTime.Now,
                                    IsActive = true,
                                    DateRangeStart = dateStart,
                                    DateRangeEnd = dateEnd
                                };
                                context.YieldAlerts.Add(newAlert);
                                await context.SaveChangesAsync();

                                // Broadcast
                                await _hubContext.Clients.All.SendAsync("ReceiveAlert", newAlert);
                            }
                        }
                    }
                    else
                    {
                        // Yield is GOOD. Resolve any active alerts.
                        var activeAlert = await context.YieldAlerts
                            .Where(a => a.MachineId == machineId && a.IsActive)
                            .FirstOrDefaultAsync();

                        if (activeAlert != null)
                        {
                            activeAlert.IsActive = false;
                            activeAlert.ResolvedAt = DateTime.Now;
                            await context.SaveChangesAsync();

                            // Broadcast resolution
                            await _hubContext.Clients.All.SendAsync("ResolveAlert", activeAlert.Id);
                        }
                    }
                }
            }
            finally
            {
                machineLock.Release();
            }
        }

        public async Task DeleteAlert(int id)
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                var alert = await context.YieldAlerts.FindAsync(id);
                if (alert != null)
                {
                    context.YieldAlerts.Remove(alert);
                    await context.SaveChangesAsync();
                }
            }
        }

        public async Task ClearAllAlerts()
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                // Batch delete or truncate is more efficient but for now EF Core ExecuteDelete is good (EF Core 7+)
                // Or standard remove range for compatibility
                var allAlerts = await context.YieldAlerts.ToListAsync();
                if (allAlerts.Any())
                {
                    context.YieldAlerts.RemoveRange(allAlerts);
                    await context.SaveChangesAsync();
                }
            }
        }
    }
}
