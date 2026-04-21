namespace LensAssemblyMonitoringWeb.Services
{

    public interface ILogCache
    {

        CompressedLogContent? Get(string key);

        void Set(string key, CompressedLogContent content);

        bool Remove(string key);

        CacheStats GetStats();

        string GenerateKey(int MCId, string logFilePath);
    }

    public class CacheStats
    {

        public int ItemCount { get; init; }

        public long TotalSizeBytes { get; init; }

        public long MaxSizeBytes { get; init; }

        public long HitCount { get; init; }

        public long MissCount { get; init; }

        public long EvictionCount { get; init; }

        public double HitRate => HitCount + MissCount > 0
            ? (double)HitCount / (HitCount + MissCount)
            : 0;

        public double UtilizationPercent => MaxSizeBytes > 0
            ? (double)TotalSizeBytes / MaxSizeBytes * 100
            : 0;
    }

    public class CompressedLogContent
    {

        public string FileName { get; set; } = "";

        public byte[] CompressedData { get; set; } = Array.Empty<byte>();

        public long CompressedSize { get; set; }

        public long OriginalSize { get; set; }

        public DateTime CachedAt { get; set; } = DateTime.UtcNow;
    }
}

