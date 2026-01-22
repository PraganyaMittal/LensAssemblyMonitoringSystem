using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// In-memory LRU cache for image thumbnails.
    /// Thumbnails are cached per log file and evicted when cache limit is exceeded.
    /// </summary>
    public interface IThumbnailCache
    {
        /// <summary>
        /// Store thumbnails for a log file.
        /// </summary>
        void SetThumbnails(string logFileHash, List<ThumbnailData> thumbnails);

        /// <summary>
        /// Get thumbnails for a log file.
        /// Returns null if not cached.
        /// </summary>
        List<ThumbnailData>? GetThumbnails(string logFileHash);

        /// <summary>
        /// Get thumbnails for a specific operation within a log file.
        /// </summary>
        List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName);

        /// <summary>
        /// Check if thumbnails are available for a log file.
        /// </summary>
        bool HasThumbnails(string logFileHash);
    }

    public class ThumbnailCache : IThumbnailCache
    {
        private readonly ILogger<ThumbnailCache> _logger;
        private readonly ConcurrentDictionary<string, CacheEntry> _cache;
        private readonly long _maxCacheSize;
        private long _currentCacheSize;
        private readonly object _sizeLock = new();

        public ThumbnailCache(ILogger<ThumbnailCache> logger, long maxCacheSizeBytes = 100 * 1024 * 1024)
        {
            _logger = logger;
            _cache = new ConcurrentDictionary<string, CacheEntry>();
            _maxCacheSize = maxCacheSizeBytes;
            _currentCacheSize = 0;
        }

        public void SetThumbnails(string logFileHash, List<ThumbnailData> thumbnails)
        {
            // Calculate size of new entry
            long entrySize = thumbnails.Sum(t => t.Data.Length);

            // Evict old entries if needed
            while (_currentCacheSize + entrySize > _maxCacheSize && _cache.Count > 0)
            {
                EvictOldest();
            }

            // Remove existing entry for this hash if present
            if (_cache.TryRemove(logFileHash, out var oldEntry))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize -= oldEntry.Size;
                }
            }

            // Add new entry
            var entry = new CacheEntry
            {
                Thumbnails = thumbnails,
                Size = entrySize,
                LastAccessed = DateTime.UtcNow
            };

            if (_cache.TryAdd(logFileHash, entry))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize += entrySize;
                }
                _logger.LogDebug("Cached {Count} thumbnails for log {LogHash} ({Size} bytes)",
                    thumbnails.Count, logFileHash, entrySize);
            }
        }

        public List<ThumbnailData>? GetThumbnails(string logFileHash)
        {
            if (_cache.TryGetValue(logFileHash, out var entry))
            {
                entry.LastAccessed = DateTime.UtcNow;
                return entry.Thumbnails;
            }
            return null;
        }

        public List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName)
        {
            var all = GetThumbnails(logFileHash);
            return all?.Where(t => t.OperationName == operationName).ToList();
        }

        public bool HasThumbnails(string logFileHash)
        {
            return _cache.ContainsKey(logFileHash);
        }

        private void EvictOldest()
        {
            var oldest = _cache
                .OrderBy(kvp => kvp.Value.LastAccessed)
                .FirstOrDefault();

            if (oldest.Key != null && _cache.TryRemove(oldest.Key, out var removed))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize -= removed.Size;
                }
                _logger.LogDebug("Evicted thumbnails for log {LogHash}", oldest.Key);
            }
        }

        private class CacheEntry
        {
            public List<ThumbnailData> Thumbnails { get; set; } = new();
            public long Size { get; set; }
            public DateTime LastAccessed { get; set; }
        }
    }

    /// <summary>
    /// Individual thumbnail data.
    /// </summary>
    public class ThumbnailData
    {
        public string OperationName { get; set; } = "";
        public string ImagePath { get; set; } = "";
        public string Filename { get; set; } = "";
        public string Data { get; set; } = "";  // Base64 encoded JPEG
    }

    /// <summary>
    /// Request model for uploading thumbnails from agent.
    /// </summary>
    public class ThumbnailUploadRequest
    {
        public string LogFileName { get; set; } = "";
        public List<ThumbnailData> Thumbnails { get; set; } = new();
    }
}
