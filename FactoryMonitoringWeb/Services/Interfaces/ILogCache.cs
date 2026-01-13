namespace FactoryMonitoringWeb.Services.Interfaces
{
    /// <summary>
    /// Interface for log content caching with LRU and size-based eviction.
    /// 
    /// Design Decision: Abstraction over caching because:
    /// 1. Testability - can mock for unit tests
    /// 2. Flexibility - can swap implementations (in-memory, distributed)
    /// 3. Metrics - implementations can track hit rates
    /// 
    /// Cache Key Format: Uses log filename (e.g., "2026011301_GeneralLog.log")
    /// which contains rotation timestamp for natural invalidation.
    /// </summary>
    public interface ILogCache
    {
        /// <summary>
        /// Gets cached log content by key.
        /// Updates LRU position on hit.
        /// </summary>
        /// <param name="key">Cache key (format: {pcId}_{logFileName})</param>
        /// <returns>Cached content if found, null otherwise</returns>
        CompressedLogContent? Get(string key);

        /// <summary>
        /// Stores log content in cache.
        /// May trigger LRU eviction if size limit exceeded.
        /// </summary>
        /// <param name="key">Cache key</param>
        /// <param name="content">Compressed log content</param>
        void Set(string key, CompressedLogContent content);

        /// <summary>
        /// Removes specific item from cache.
        /// </summary>
        /// <param name="key">Cache key</param>
        /// <returns>True if removed, false if not found</returns>
        bool Remove(string key);

        /// <summary>
        /// Gets current cache statistics.
        /// </summary>
        CacheStats GetStats();

        /// <summary>
        /// Generates cache key from PC ID and log file path.
        /// Extracts filename (YYYYMMDDHH_GeneralLog.log) for natural rotation handling.
        /// </summary>
        /// <param name="pcId">PC ID</param>
        /// <param name="logFilePath">Full path to log file</param>
        /// <returns>Cache key</returns>
        string GenerateKey(int pcId, string logFilePath);
    }

    /// <summary>
    /// Cache statistics for monitoring.
    /// </summary>
    public class CacheStats
    {
        /// <summary>Current number of items in cache.</summary>
        public int ItemCount { get; init; }

        /// <summary>Total size of cached items in bytes.</summary>
        public long TotalSizeBytes { get; init; }

        /// <summary>Maximum allowed size in bytes.</summary>
        public long MaxSizeBytes { get; init; }

        /// <summary>Number of cache hits since startup.</summary>
        public long HitCount { get; init; }

        /// <summary>Number of cache misses since startup.</summary>
        public long MissCount { get; init; }

        /// <summary>Number of items evicted since startup.</summary>
        public long EvictionCount { get; init; }

        /// <summary>Cache hit rate (0.0 to 1.0).</summary>
        public double HitRate => HitCount + MissCount > 0
            ? (double)HitCount / (HitCount + MissCount)
            : 0;

        /// <summary>Current size as percentage of max.</summary>
        public double UtilizationPercent => MaxSizeBytes > 0
            ? (double)TotalSizeBytes / MaxSizeBytes * 100
            : 0;
    }

    /// <summary>
    /// Compressed log content stored in cache.
    /// </summary>
    public class CompressedLogContent
    {
        /// <summary>Filename (e.g., "2026011301_GeneralLog.log")</summary>
        public string FileName { get; set; } = "";

        /// <summary>GZIP compressed bytes from agent</summary>
        public byte[] CompressedData { get; set; } = Array.Empty<byte>();

        /// <summary>Size of compressed data in bytes</summary>
        public long CompressedSize { get; set; }

        /// <summary>Original uncompressed size in bytes</summary>
        public long OriginalSize { get; set; }

        /// <summary>When this content was cached</summary>
        public DateTime CachedAt { get; set; } = DateTime.UtcNow;
    }
}
