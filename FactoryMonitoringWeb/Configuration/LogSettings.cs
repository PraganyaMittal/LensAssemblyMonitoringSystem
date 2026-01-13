namespace FactoryMonitoringWeb.Configuration
{
    /// <summary>
    /// Configuration settings for log service.
    /// Loaded from appsettings.json "LogSettings" section.
    /// </summary>
    public class LogSettings
    {
        /// <summary>
        /// Section name in appsettings.json
        /// </summary>
        public const string SectionName = "LogSettings";

        /// <summary>
        /// Base timeout in seconds for log requests.
        /// Default: 30 seconds
        /// </summary>
        public int BaseTimeoutSeconds { get; set; } = 30;

        /// <summary>
        /// Additional timeout per MB of expected log file size.
        /// Default: 5 seconds per MB
        /// </summary>
        public int TimeoutPerMBSeconds { get; set; } = 5;

        /// <summary>
        /// Maximum allowed timeout in seconds.
        /// Default: 180 seconds (3 minutes)
        /// </summary>
        public int MaxTimeoutSeconds { get; set; } = 180;

        /// <summary>
        /// Expected log file size in MB for timeout calculation.
        /// Default: 15 MB
        /// </summary>
        public int ExpectedFileSizeMB { get; set; } = 15;

        /// <summary>
        /// Maximum cache size in MB.
        /// Default: 100 MB
        /// </summary>
        public int CacheSizeLimitMB { get; set; } = 100;

        /// <summary>
        /// Calculates timeout based on expected file size.
        /// Formula: BaseTimeout + (ExpectedSizeMB × TimePerMB)
        /// Capped at MaxTimeout.
        /// </summary>
        public TimeSpan CalculatedTimeout =>
            TimeSpan.FromSeconds(Math.Min(
                BaseTimeoutSeconds + (ExpectedFileSizeMB * TimeoutPerMBSeconds),
                MaxTimeoutSeconds));

        /// <summary>
        /// Cache size limit in bytes.
        /// </summary>
        public long CacheSizeLimitBytes => CacheSizeLimitMB * 1024L * 1024L;
    }
}
