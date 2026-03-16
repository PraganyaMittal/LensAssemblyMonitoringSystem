using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{

    public interface IThumbnailCache
    {

        void SetThumbnails(string logFileHash, List<ThumbnailData> thumbnails);

        List<ThumbnailData>? GetThumbnails(string logFileHash);

        List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName, string? barrelId = null);

        bool HasThumbnails(string logFileHash);
    }

    public class ThumbnailCache : IThumbnailCache
    {
        private readonly ILogger<ThumbnailCache> _logger;
        private readonly IWebHostEnvironment _environment; 
        private readonly ConcurrentDictionary<string, CacheEntry> _cache;
        private readonly long _maxCacheSize;
        private long _currentCacheSize;
        private readonly object _sizeLock = new();
        private readonly string _cacheDirectory;

        public ThumbnailCache(
            ILogger<ThumbnailCache> logger, 
            IWebHostEnvironment environment, 
            long maxCacheSizeBytes = 500 * 1024 * 1024) 
        {
            _logger = logger;
            _environment = environment;
            _cache = new ConcurrentDictionary<string, CacheEntry>();
            _maxCacheSize = maxCacheSizeBytes;
            _currentCacheSize = 0;
            _cacheDirectory = ""; 
        }

        public void SetThumbnails(string logFileHash, List<ThumbnailData> thumbnails)
        {
            
            AddToMemoryCache(logFileHash, thumbnails);
        }

        private void AddToMemoryCache(string logFileHash, List<ThumbnailData> thumbnails)
        {
            
            long entrySize = thumbnails.Sum(t => t.Data.Length);

            while (_currentCacheSize + entrySize > _maxCacheSize && _cache.Count > 0)
            {
                EvictOldest();
            }

            if (_cache.TryRemove(logFileHash, out var oldEntry))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize -= oldEntry.Size;
                }
            }

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

        public List<ThumbnailData>? GetThumbnailsForOperation(string logFileHash, string operationName, string? barrelId = null)
        {
            var all = GetThumbnails(logFileHash);
            if (all == null) return null;

            var filtered = all.Where(t => t.OperationName == operationName);

            if (!string.IsNullOrEmpty(barrelId))
            {
                filtered = filtered.Where(t => 
                {
                    var pathId = ExtractBarrelIdFromPath(t.ImagePath);
                    if (pathId == null) return false;

                    if (pathId == barrelId) return true;

                    if (int.TryParse(pathId, out int pId) && int.TryParse(barrelId, out int qId))
                    {
                        return pId == qId;
                    }

                    return false;
                });
            }
            
            return filtered.ToList();
        }

        private static string? ExtractBarrelIdFromPath(string imagePath)
        {
            if (string.IsNullOrEmpty(imagePath)) return null;

            var parts = imagePath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);

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

    public class ThumbnailData
    {
        public string OperationName { get; set; } = "";
        public string ImagePath { get; set; } = "";
        public string Filename { get; set; } = "";
        public string Data { get; set; } = "";  
    }

    public class ThumbnailUploadRequest
    {
        public string LogFileName { get; set; } = "";
        public List<ThumbnailData> Thumbnails { get; set; } = new();
    }
}

