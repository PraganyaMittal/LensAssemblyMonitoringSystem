namespace LensAssemblyMonitoringWeb.Features.Logs.Configuration
{

    public class LogSettings
    {

        public const string SectionName = "LogSettings";

        public int BaseTimeoutSeconds { get; set; } = 30;

        public int TimeoutPerMBSeconds { get; set; } = 5;

        public int MaxTimeoutSeconds { get; set; } = 180;

        public int ExpectedFileSizeMB { get; set; } = 15;

        public int CacheSizeLimitMB { get; set; } = 100;

        public TimeSpan CalculatedTimeout =>
            TimeSpan.FromSeconds(Math.Min(
                BaseTimeoutSeconds + (ExpectedFileSizeMB * TimeoutPerMBSeconds),
                MaxTimeoutSeconds));

        public long CacheSizeLimitBytes => CacheSizeLimitMB * 1024L * 1024L;
    }
}



