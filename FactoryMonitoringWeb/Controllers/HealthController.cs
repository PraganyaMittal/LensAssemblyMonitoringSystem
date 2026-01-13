using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Health check endpoint for monitoring system status.
    /// </summary>
    [Route("api")]
    [ApiController]
    public class HealthController : ControllerBase
    {
        private readonly ILogCache _logCache;
        private readonly ILogger<HealthController> _logger;

        public HealthController(
            ILogCache logCache,
            ILogger<HealthController> logger)
        {
            _logCache = logCache ?? throw new ArgumentNullException(nameof(logCache));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Gets the health status of the application.
        /// </summary>
        [HttpGet("health")]
        [ProducesResponseType(typeof(HealthStatus), StatusCodes.Status200OK)]
        public ActionResult<HealthStatus> GetHealth()
        {
            var cacheStats = _logCache.GetStats();

            return Ok(new HealthStatus
            {
                Status = "Healthy",
                Timestamp = DateTime.UtcNow,
                Version = GetType().Assembly.GetName().Version?.ToString() ?? "1.0.0",
                Cache = new CacheHealth
                {
                    ItemCount = cacheStats.ItemCount,
                    SizeMB = Math.Round((double)cacheStats.TotalSizeBytes / (1024 * 1024), 2),
                    MaxSizeMB = Math.Round((double)cacheStats.MaxSizeBytes / (1024 * 1024), 2),
                    UtilizationPercent = Math.Round(cacheStats.UtilizationPercent, 1),
                    HitRate = Math.Round(cacheStats.HitRate * 100, 1),
                    HitCount = cacheStats.HitCount,
                    MissCount = cacheStats.MissCount,
                    EvictionCount = cacheStats.EvictionCount
                }
            });
        }
    }

    /// <summary>
    /// Health status response.
    /// </summary>
    public class HealthStatus
    {
        public string Status { get; set; } = "Healthy";
        public DateTime Timestamp { get; set; }
        public string Version { get; set; } = "1.0.0";
        public CacheHealth Cache { get; set; } = new();
    }

    /// <summary>
    /// Cache health metrics.
    /// </summary>
    public class CacheHealth
    {
        public int ItemCount { get; set; }
        public double SizeMB { get; set; }
        public double MaxSizeMB { get; set; }
        public double UtilizationPercent { get; set; }
        public double HitRate { get; set; }
        public long HitCount { get; set; }
        public long MissCount { get; set; }
        public long EvictionCount { get; set; }
    }
}
