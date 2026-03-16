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
        Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield, DateTime? dateStart, DateTime? dateEnd, long currentTotalCount = 0);
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
        private readonly ReaderWriterLockSlim _settingsLock = new();

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
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Failed to load yield alert settings from {Path}", _settingsPath);
                }
            }
            return new YieldAlertSettings();
        }

        public Task<YieldAlertSettings> GetSettings()
        {
            _settingsLock.EnterReadLock();
            try
            {
                
                var copy = new YieldAlertSettings
                {
                    Threshold = _cachedSettings.Threshold,
                    CooldownMinutes = _cachedSettings.CooldownMinutes
                };
                return Task.FromResult(copy);
            }
            finally
            {
                _settingsLock.ExitReadLock();
            }
        }

        public async Task UpdateSettings(YieldAlertSettings settings)
        {
            _settingsLock.EnterWriteLock();
            try
            {
                _cachedSettings = settings;
            }
            finally
            {
                _settingsLock.ExitWriteLock();
            }

            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            
            var directory = Path.GetDirectoryName(_settingsPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await File.WriteAllTextAsync(_settingsPath, json);
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<int, SemaphoreSlim> _locks = new();

        public async Task CheckYield(int machineId, string machineName, int lineNumber, double currentYield, DateTime? dateStart, DateTime? dateEnd, long currentTotalCount = 0)
        {
            
            var machineLock = _locks.GetOrAdd(machineId, _ => new SemaphoreSlim(1, 1));

            await machineLock.WaitAsync();

            try
            {
                using (var scope = _scopeFactory.CreateScope())
                {
                    var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                    
                    double threshold;
                    int cooldownMinutes;

                    _settingsLock.EnterReadLock();
                    try
                    {
                        threshold = _cachedSettings.Threshold;
                        cooldownMinutes = _cachedSettings.CooldownMinutes;
                    }
                    finally
                    {
                        _settingsLock.ExitReadLock();
                    }

                    _logger.LogInformation("Checking Yield: MC={MCId}, Cur={Cur}, Thresh={Thresh}, TotalParts={Total}", machineId, currentYield, threshold, currentTotalCount);

                    int minPartsThreshold = 50; 
                    if (currentTotalCount < minPartsThreshold)
                    {
                        _logger.LogInformation("Yield alert check SKIPPED: MC={MCId}, TotalCount={Total} < Min={Min}", machineId, currentTotalCount, minPartsThreshold);
                        return;
                    }

                    if (currentYield < threshold)
                    {
                        
                        var activeAlert = await context.YieldAlerts
                            .Where(a => a.MachineId == machineId && a.IsActive)
                            .FirstOrDefaultAsync();

                        if (activeAlert == null)
                        {
                            
                            var cooldownTime = DateTime.Now.AddMinutes(-_cachedSettings.CooldownMinutes);
                            var recentAlert = await context.YieldAlerts
                                .Where(a => a.MachineId == machineId && a.CreatedAt >= cooldownTime)
                                .OrderByDescending(a => a.CreatedAt)
                                .FirstOrDefaultAsync();

                            if (recentAlert == null)
                            {
                                
                                var newAlert = new YieldAlert
                                {
                                    MachineId = machineId,
                                    MachineName = machineName,
                                    LineNumber = lineNumber,
                                    CurrentYield = currentYield,
                                    Threshold = threshold,
                                    CreatedAt = DateTime.Now,
                                    IsActive = true,
                                    DateRangeStart = dateStart,
                                    DateRangeEnd = dateEnd
                                };
                                context.YieldAlerts.Add(newAlert);
                                await context.SaveChangesAsync();

                                await _hubContext.Clients.All.SendAsync("ReceiveAlert", newAlert);
                            }
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

                await context.YieldAlerts.ExecuteDeleteAsync();
            }
        }
    }
}

