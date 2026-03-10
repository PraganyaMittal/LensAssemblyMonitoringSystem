using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Background service that auto-purges archived packages after RetentionDays.
    /// Runs once every 6 hours. Deletes both the disk file and DB row.
    /// RetentionDays is read from UpdateSettings table (default: 30 days).
    /// </summary>
    public class PackageCleanupService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<PackageCleanupService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);

        public PackageCleanupService(
            IServiceProvider serviceProvider,
            ILogger<PackageCleanupService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("PackageCleanupService started — checking every {Hours}h", CheckInterval.TotalHours);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await PurgeExpiredPackagesAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during package cleanup");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        private async Task PurgeExpiredPackagesAsync(CancellationToken ct)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();

            // Get retention days (hardcoded to 30)
            var retentionDays = 30;

            var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);

            // Find expired archived packages
            var expiredPackages = await context.UpdatePackages
                .Where(p => !p.IsActive && p.ArchivedDate != null && p.ArchivedDate <= cutoffDate)
                .ToListAsync(ct);

            if (!expiredPackages.Any()) return;

            _logger.LogInformation("Found {Count} expired archived packages to purge (retention: {Days} days)",
                expiredPackages.Count, retentionDays);

            foreach (var package in expiredPackages)
            {
                try
                {
                    // Delete file from disk
                    var fullPath = Path.Combine(env.WebRootPath, package.StoragePath);
                    if (File.Exists(fullPath))
                    {
                        File.Delete(fullPath);
                        _logger.LogInformation("Deleted file: {Path}", fullPath);
                    }

                    // Hard delete from DB
                    context.UpdatePackages.Remove(package);
                    await context.SaveChangesAsync(ct);

                    _logger.LogInformation("Auto-purged package {Id}: {Name} v{Version}",
                        package.UpdatePackageId, package.PackageName, package.Version);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to purge package {Id}", package.UpdatePackageId);
                }
            }
        }
    }
}
