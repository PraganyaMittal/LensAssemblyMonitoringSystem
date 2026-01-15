using FactoryMonitoringWeb.Services;
using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Thread-safe LRU cache with size-based eviction for log content.
    /// 
    /// Design Decisions:
    /// 1. LRU eviction: Recently accessed items stay longer
    /// 2. Size-based limit: 100MB default, configurable
    /// 3. Compressed storage: Stores GZIP bytes directly from agent
    /// 4. Thread-safe: Uses lock for write operations, lock-free reads where possible
    /// 
    /// Eviction Strategy:
    /// When adding item would exceed size limit:
    /// 1. Evict least recently used items
    /// 2. Continue until under limit or cache empty
    /// 
    /// Performance:
    /// - Get: O(1) average with dictionary lookup + LRU update
    /// - Set: O(1) average, O(n) worst case during eviction
    /// </summary>
    public class LruSizeBasedLogCache : ILogCache
    {
        private readonly object _lock = new();
        private readonly Dictionary<string, LinkedListNode<CacheEntry>> _cache;
        private readonly LinkedList<CacheEntry> _lruList;
        private readonly long _maxSizeBytes;
        private readonly ILogger<LruSizeBasedLogCache> _logger;

        private long _currentSizeBytes;
        private long _hitCount;
        private long _missCount;
        private long _evictionCount;

        /// <summary>
        /// Default max cache size: 100MB
        /// </summary>
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

        /// <inheritdoc/>
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
                    // Move to front of LRU list (most recently used)
                    _lruList.Remove(node);
                    _lruList.AddFirst(node);

                    Interlocked.Increment(ref _hitCount);

                    _logger.LogDebug("Cache HIT for {Key}", key);
                    return node.Value.Content;
                }

                Interlocked.Increment(ref _missCount);
                _logger.LogDebug("Cache MISS for {Key}", key);
                return null;
            }
        }

        /// <inheritdoc/>
        public void Set(string key, CompressedLogContent content)
        {
            if (string.IsNullOrEmpty(key) || content == null)
            {
                return;
            }

            var contentSize = content.CompressedSize;

            // Don't cache items larger than max size
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
                // If key exists, remove old entry first
                if (_cache.TryGetValue(key, out var existingNode))
                {
                    _currentSizeBytes -= existingNode.Value.Content.CompressedSize;
                    _lruList.Remove(existingNode);
                    _cache.Remove(key);
                }

                // Evict LRU items until we have room
                while (_currentSizeBytes + contentSize > _maxSizeBytes && _lruList.Count > 0)
                {
                    EvictLeastRecentlyUsed();
                }

                // Add new entry at front of LRU list
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

        /// <inheritdoc/>
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

        /// <inheritdoc/>
        public CacheStats GetStats()
        {
            lock (_lock)
            {
                return new CacheStats
                {
                    ItemCount = _cache.Count,
                    TotalSizeBytes = _currentSizeBytes,
                    MaxSizeBytes = _maxSizeBytes,
                    HitCount = _hitCount,
                    MissCount = _missCount,
                    EvictionCount = _evictionCount
                };
            }
        }

        /// <inheritdoc/>
        public string GenerateKey(int pcId, string logFilePath)
        {
            // Extract filename from path (e.g., "2026011301_GeneralLog.log")
            var fileName = Path.GetFileName(logFilePath);
            return $"{pcId}_{fileName}";
        }

        /// <summary>
        /// Evicts the least recently used item from the cache.
        /// Caller must hold the lock.
        /// </summary>
        private void EvictLeastRecentlyUsed()
        {
            var lruNode = _lruList.Last;
            if (lruNode != null)
            {
                var entry = lruNode.Value;
                _currentSizeBytes -= entry.Content.CompressedSize;
                _lruList.RemoveLast();
                _cache.Remove(entry.Key);

                Interlocked.Increment(ref _evictionCount);

                _logger.LogDebug(
                    "Evicted LRU item {Key}: {SizeKB}KB freed",
                    entry.Key,
                    entry.Content.CompressedSize / 1024);
            }
        }

        /// <summary>
        /// Internal cache entry linking key with content.
        /// </summary>
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
