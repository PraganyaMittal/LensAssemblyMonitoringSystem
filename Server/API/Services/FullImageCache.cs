

namespace LensAssemblyMonitoringWeb.Services
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
        private readonly object _lock = new();
        private readonly Dictionary<string, LinkedListNode<CacheEntry>> _cache;
        private readonly LinkedList<CacheEntry> _lruList;
        private readonly long _maxCacheSize;
        private long _currentCacheSize;

        /// <summary>
        /// Images older than this are considered expired and evicted on access.
        /// </summary>
        private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(30);

        public FullImageCache(
            ILogger<FullImageCache> logger,
            long maxCacheSizeBytes = 500 * 1024 * 1024) 
        {
            _logger = logger;
            _cache = new Dictionary<string, LinkedListNode<CacheEntry>>();
            _lruList = new LinkedList<CacheEntry>();
            _maxCacheSize = maxCacheSizeBytes;
            _currentCacheSize = 0;
        }

        public void SetImage(string key, CachedImage image)
        {
            long entrySize = image.Data.Length;

            // Don't cache entries larger than half the max size
            if (entrySize > _maxCacheSize / 2) return;

            lock (_lock)
            {
                // Remove existing entry for this key if present
                if (_cache.TryGetValue(key, out var existingNode))
                {
                    _currentCacheSize -= existingNode.Value.Size;
                    _lruList.Remove(existingNode);
                    _cache.Remove(key);
                }

                // Evict LRU entries until we have room
                while (_currentCacheSize + entrySize > _maxCacheSize && _lruList.Count > 0)
                {
                    EvictLeastRecentlyUsed();
                }

                var entry = new CacheEntry
                {
                    Key = key,
                    Image = image,
                    Size = entrySize,
                    CachedAt = DateTime.UtcNow
                };

                var node = _lruList.AddFirst(entry);
                _cache[key] = node;
                _currentCacheSize += entrySize;

                _logger.LogDebug("Cached full image {Key} ({Size} bytes)", key, entrySize);
            }
        }

        public CachedImage? GetImage(string key)
        {
            lock (_lock)
            {
                if (_cache.TryGetValue(key, out var node))
                {
                    // Check TTL — evict expired entries
                    if (DateTime.UtcNow - node.Value.CachedAt > MaxAge)
                    {
                        _currentCacheSize -= node.Value.Size;
                        _lruList.Remove(node);
                        _cache.Remove(key);
                        _logger.LogDebug("Expired full image {Key} (age exceeded {MaxAge})", key, MaxAge);
                        return null;
                    }

                    // Move to front (most recently used)
                    _lruList.Remove(node);
                    _lruList.AddFirst(node);
                    return node.Value.Image;
                }
                return null;
            }
        }

        /// <summary>
        /// Evicts the least recently used entry. Must be called within <see cref="_lock"/>.
        /// O(1) operation.
        /// </summary>
        private void EvictLeastRecentlyUsed()
        {
            var lruNode = _lruList.Last;
            if (lruNode != null)
            {
                _currentCacheSize -= lruNode.Value.Size;
                _lruList.RemoveLast();
                _cache.Remove(lruNode.Value.Key);

                _logger.LogDebug(
                    "Evicted LRU image {Key}: {SizeKB}KB freed",
                    lruNode.Value.Key,
                    lruNode.Value.Size / 1024);
            }
        }

        private class CacheEntry
        {
            public string Key { get; set; } = "";
            public CachedImage Image { get; set; } = new();
            public long Size { get; set; }
            public DateTime CachedAt { get; set; }
        }
    }
}

