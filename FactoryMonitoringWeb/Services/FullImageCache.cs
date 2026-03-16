using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{
    public class CachedImage
    {
        public byte[] Data { get; set; } = Array.Empty<byte>();
        public string Filename { get; set; } = "";
        public string ContentType { get; set; } = "image/bmp";
        public DateTime CachedAt { get; set; }
    }

    public interface IFullImageCache
    {
        void SetImage(string key, CachedImage image);
        CachedImage? GetImage(string key);
    }

    public class FullImageCache : IFullImageCache
    {
        private readonly ILogger<FullImageCache> _logger;
        private readonly ConcurrentDictionary<string, CacheEntry> _cache;
        private readonly long _maxCacheSize;
        private long _currentCacheSize;
        private readonly object _sizeLock = new();

        public FullImageCache(
            ILogger<FullImageCache> logger,
            long maxCacheSizeBytes = 500 * 1024 * 1024) 
        {
            _logger = logger;
            _cache = new ConcurrentDictionary<string, CacheEntry>();
            _maxCacheSize = maxCacheSizeBytes;
            _currentCacheSize = 0;
        }

        public void SetImage(string key, CachedImage image)
        {
            long entrySize = image.Data.Length;

            if (entrySize > _maxCacheSize / 2) return;

            while (_currentCacheSize + entrySize > _maxCacheSize && _cache.Count > 0)
            {
                EvictOldest();
            }

            if (_cache.TryRemove(key, out var oldEntry))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize -= oldEntry.Size;
                }
            }

            var entry = new CacheEntry
            {
                Image = image,
                Size = entrySize,
                LastAccessed = DateTime.UtcNow
            };

            if (_cache.TryAdd(key, entry))
            {
                lock (_sizeLock)
                {
                    _currentCacheSize += entrySize;
                }
                _logger.LogDebug("Cached full image {Key} ({Size} bytes)", key, entrySize);
            }
        }

        public CachedImage? GetImage(string key)
        {
            if (_cache.TryGetValue(key, out var entry))
            {
                entry.LastAccessed = DateTime.UtcNow;
                return entry.Image;
            }
            return null;
        }

        private void EvictOldest()
        {
            try
            {

                var oldest = _cache.OrderBy(kvp => kvp.Value.LastAccessed).FirstOrDefault();
                
                if (oldest.Key != null)
                {
                    if (_cache.TryRemove(oldest.Key, out var removed))
                    {
                        lock (_sizeLock)
                        {
                            _currentCacheSize -= removed.Size;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error evicting from FullImageCache");
            }
        }

        private class CacheEntry
        {
            public CachedImage Image { get; set; } = new();
            public long Size { get; set; }
            public DateTime LastAccessed { get; set; }
        }
    }
}

