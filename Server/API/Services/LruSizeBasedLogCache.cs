using LensAssemblyMonitoringWeb.Services;
using System.Collections.Concurrent;

namespace LensAssemblyMonitoringWeb.Services
{

    public class LruSizeBasedLogCache : ILogCache
    {
        private readonly object _lock = new();
        private readonly Dictionary<string, LinkedListNode<CacheEntry>> _cache;
        private readonly LinkedList<CacheEntry> _lruList;
        private readonly long _maxSizeBytes;
        private readonly ILogger<LruSizeBasedLogCache> _logger;

        private long _currentSizeBytes;

        public const long DefaultMaxSizeBytes = 100 * 1024 * 1024;

        public LruSizeBasedLogCache(
            ILogger<LruSizeBasedLogCache> logger,
            long? maxSizeBytes = null)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _maxSizeBytes = maxSizeBytes ?? DefaultMaxSizeBytes;
            _cache = new Dictionary<string, LinkedListNode<CacheEntry>>();
            _lruList = new LinkedList<CacheEntry>();

            _logger.LogInformation(
                "LRU Log Cache initialized with {MaxSizeMB}MB limit",
                _maxSizeBytes / (1024 * 1024));
        }

        public CompressedLogContent? Get(string key)
        {
            if (string.IsNullOrEmpty(key))
            {
                return null;
            }

            lock (_lock)
            {
                if (_cache.TryGetValue(key, out var node))
                {
                    
                    _lruList.Remove(node);
                    _lruList.AddFirst(node);

                    _logger.LogDebug("Cache HIT for {Key}", key);
                    return node.Value.Content;
                }

                _logger.LogDebug("Cache MISS for {Key}", key);
                return null;
            }
        }

        public void Set(string key, CompressedLogContent content)
        {
            if (string.IsNullOrEmpty(key) || content == null)
            {
                return;
            }

            var contentSize = content.CompressedSize;

            if (contentSize > _maxSizeBytes)
            {
                _logger.LogWarning(
                    "Content too large to cache: {SizeMB}MB > {MaxMB}MB limit",
                    contentSize / (1024 * 1024),
                    _maxSizeBytes / (1024 * 1024));
                return;
            }

            lock (_lock)
            {
                
                if (_cache.TryGetValue(key, out var existingNode))
                {
                    _currentSizeBytes -= existingNode.Value.Content.CompressedSize;
                    _lruList.Remove(existingNode);
                    _cache.Remove(key);
                }

                while (_currentSizeBytes + contentSize > _maxSizeBytes && _lruList.Count > 0)
                {
                    EvictLeastRecentlyUsed();
                }

                var entry = new CacheEntry(key, content);
                var node = _lruList.AddFirst(entry);
                _cache[key] = node;
                _currentSizeBytes += contentSize;

                _logger.LogDebug(
                    "Cached {Key}: {SizeKB}KB, Total: {TotalMB}MB/{MaxMB}MB",
                    key,
                    contentSize / 1024,
                    _currentSizeBytes / (1024 * 1024),
                    _maxSizeBytes / (1024 * 1024));
            }
        }

        public bool Remove(string key)
        {
            if (string.IsNullOrEmpty(key))
            {
                return false;
            }

            lock (_lock)
            {
                if (_cache.TryGetValue(key, out var node))
                {
                    _currentSizeBytes -= node.Value.Content.CompressedSize;
                    _lruList.Remove(node);
                    _cache.Remove(key);

                    _logger.LogDebug("Removed {Key} from cache", key);
                    return true;
                }
                return false;
            }
        }

        public string GenerateKey(int MCId, string logFilePath)
        {
            // Use full normalized relative path to prevent collisions
            // e.g. "42_2026/05/14/2026051414.log" instead of just "42_2026051414.log"
            var normalized = logFilePath.Replace('\\', '/').TrimStart('/');
            return $"{MCId}_{normalized}";
        }

        private void EvictLeastRecentlyUsed()
        {
            var lruNode = _lruList.Last;
            if (lruNode != null)
            {
                var entry = lruNode.Value;
                _currentSizeBytes -= entry.Content.CompressedSize;
                _lruList.RemoveLast();
                _cache.Remove(entry.Key);

                _logger.LogDebug(
                    "Evicted LRU item {Key}: {SizeKB}KB freed",
                    entry.Key,
                    entry.Content.CompressedSize / 1024);
            }
        }

        private class CacheEntry
        {
            public string Key { get; }
            public CompressedLogContent Content { get; }

            public CacheEntry(string key, CompressedLogContent content)
            {
                Key = key;
                Content = content;
            }
        }
    }
}

