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
        /// Optionally filter by barrelId (extracted from ImagePath).
        /// </summary>
        List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName, string? barrelId = null);

        /// <summary>
        /// Check if thumbnails are available for a log file.
        /// </summary>
        bool HasThumbnails(string logFileHash);
    }

    public class ThumbnailCache : IThumbnailCache
    {
        private readonly ILogger<ThumbnailCache> _logger;
        private readonly IWebHostEnvironment _environment; // Added environment
        private readonly ConcurrentDictionary<string, CacheEntry> _cache;
        private readonly long _maxCacheSize;
        private long _currentCacheSize;
        private readonly object _sizeLock = new();
        private readonly string _cacheDirectory;

        public ThumbnailCache(
            ILogger<ThumbnailCache> logger, 
            IWebHostEnvironment environment, // Injected
            long maxCacheSizeBytes = 500 * 1024 * 1024) // 500MB cache for image thumbnails
        {
            _logger = logger;
            _environment = environment;
            _cache = new ConcurrentDictionary<string, CacheEntry>();
            _maxCacheSize = maxCacheSizeBytes;
            _currentCacheSize = 0;
            _cacheDirectory = ""; // Unused
        }

        public void SetThumbnails(string logFileHash, List<ThumbnailData> thumbnails)
        {
            // Pure In-Memory Cache (Disk persistence removed per request)
            AddToMemoryCache(logFileHash, thumbnails);
        }

        private void AddToMemoryCache(string logFileHash, List<ThumbnailData> thumbnails)
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
            // 1. Check Memory Only
            if (_cache.TryGetValue(logFileHash, out var entry))
            {
                entry.LastAccessed = DateTime.UtcNow;
                return entry.Thumbnails;
            }

            return null;
        }

        public List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName, string? barrelId = null)
        {
            var all = GetThumbnails(logFileHash);
            if (all == null) return null;
            
            // Filter by operationName
            var filtered = all.Where(t => t.OperationName == operationName);
            
            // If barrelId is provided, also filter by barrelId (extracted from ImagePath)
            if (!string.IsNullOrEmpty(barrelId))
            {
                filtered = filtered.Where(t => 
                {
                    var pathId = ExtractBarrelIdFromPath(t.ImagePath);
                    if (pathId == null) return false;
                    
                    // 1. Try exact string match
                    if (pathId == barrelId) return true;

                    // 2. Try integer match (handles "0" vs "00" case)
                    if (int.TryParse(pathId, out int pId) && int.TryParse(barrelId, out int qId))
                    {
                        return pId == qId;
                    }

                    return false;
                });
            }
            
            return filtered.ToList();
        }
        
        /// <summary>
        /// Extract barrelId from ImagePath pattern: modelName/trayId/barrelId/inspectionName/
        /// </summary>
        private static string? ExtractBarrelIdFromPath(string imagePath)
        {
            if (string.IsNullOrEmpty(imagePath)) return null;
            
            // Split by both forward and back slashes
            var parts = imagePath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            
            // Path pattern: modelName/trayId/barrelId/inspectionName
            // barrelId is at index 2 (0-indexed)
            if (parts.Length >= 3)
            {
                return parts[2];
            }
            
            return null;
        }

        public bool HasThumbnails(string logFileHash)
        {
            return _cache.ContainsKey(logFileHash);
        }

        private string GetCacheFilePath(string logFileHash)
        {
            // Sanitize filename just in case, though hash is usually safe
            return Path.Combine(_cacheDirectory, $"{logFileHash}.json");
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
                _logger.LogDebug("Evicted thumbnails for log {LogHash} from memory (still on disk)", oldest.Key);
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
