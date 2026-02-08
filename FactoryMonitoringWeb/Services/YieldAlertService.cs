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
        Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield);
        Task<YieldAlertSettings> GetSettings();
        Task UpdateSettings(YieldAlertSettings settings);
    }

    public class YieldAlertService : IYieldAlertService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHubContext<YieldHub> _hubContext;
        private readonly string _settingsPath;
        private YieldAlertSettings _cachedSettings;

        public YieldAlertService(IServiceScopeFactory scopeFactory, IHubContext<YieldHub> hubContext, IWebHostEnvironment env)
        {
            _scopeFactory = scopeFactory;
            _hubContext = hubContext;
            _settingsPath = Path.Combine(env.ContentRootPath, "Data", "alert_settings.json");
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

        public async Task<YieldAlertSettings> GetSettings()
        {
            return _cachedSettings;
        }

        public async Task UpdateSettings(YieldAlertSettings settings)
        {
            _cachedSettings = settings;
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(_settingsPath, json);
        }

        public async Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield)
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                
                // Check if alert condition met
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
                                IsActive = true
                            };
                            context.YieldAlerts.Add(newAlert);
                            await context.SaveChangesAsync();

                            // Broadcast
                            await _hubContext.Clients.All.SendAsync("ReceiveAlert", newAlert);
                        }
                    }
                    else
                    {
                        // Update existing current yield?
                        // activeAlert.CurrentYield = currentYield; 
                        // await context.SaveChangesAsync();
                        // Not Critical.
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
    }
}
