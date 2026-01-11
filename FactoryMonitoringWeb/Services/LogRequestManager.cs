using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Manages log file requests with caching and concurrent request deduplication.
    /// Eliminates database polling by using TaskCompletionSource for async signaling.
    /// </summary>
    public class LogRequestManager
    {
        private readonly IMemoryCache _cache;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<LogContent>> _pendingRequests;
        private readonly ConcurrentDictionary<string, Task<LogContent>> _inFlightFetches;
        private readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);
        private readonly TimeSpan _requestTimeout = TimeSpan.FromSeconds(60);

        public LogRequestManager(IMemoryCache cache)
        {
            _cache = cache;
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<LogContent>>();
            _inFlightFetches = new ConcurrentDictionary<string, Task<LogContent>>();
        }

        /// <summary>
        /// Gets log content from cache, or fetches from Agent if not cached.
        /// Handles concurrent requests for the same file by deduplicating Agent calls.
        /// </summary>
        public async Task<LogContent> GetOrFetchAsync(int pcId, string filePath, Func<string, Task> notifyAgent)
        {
            string cacheKey = $"log_{pcId}_{filePath}";

            // 1. Check cache first (instant return for cached files)
            if (_cache.TryGetValue(cacheKey, out LogContent? cached) && cached != null)
            {
                return cached;
            }

            // 2. Check if another request is already fetching this file
            var fetchTask = _inFlightFetches.GetOrAdd(cacheKey, _ => FetchFromAgentAsync(pcId, filePath, notifyAgent));

            try
            {
                var result = await fetchTask;
                
                // Cache the result
                _cache.Set(cacheKey, result, _cacheExpiration);
                
                return result;
            }
            finally
            {
                // Remove from in-flight once done
                _inFlightFetches.TryRemove(cacheKey, out _);
            }
        }

        private async Task<LogContent> FetchFromAgentAsync(int pcId, string filePath, Func<string, Task> notifyAgent)
        {
            string requestId = GenerateRequestId();
            var tcs = new TaskCompletionSource<LogContent>(TaskCreationOptions.RunContinuationsAsynchronously);

            _pendingRequests[requestId] = tcs;

            try
            {
                // Notify Agent via WebSocket
                await notifyAgent(requestId);

                // Wait for Agent to upload (with timeout)
                using var cts = new CancellationTokenSource(_requestTimeout);
                cts.Token.Register(() => tcs.TrySetException(new TimeoutException("Agent did not respond")));

                return await tcs.Task;
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
            }
        }

        /// <summary>
        /// Called by uploadlog endpoint when Agent uploads the file.
        /// </summary>
        public bool CompleteRequest(string requestId, LogContent content)
        {
            if (_pendingRequests.TryRemove(requestId, out var tcs))
            {
                return tcs.TrySetResult(content);
            }
            return false;
        }

        /// <summary>
        /// Check if a request is pending (for backward compatibility).
        /// </summary>
        public bool HasPendingRequest(string requestId)
        {
            return _pendingRequests.ContainsKey(requestId);
        }

        public string GenerateRequestId()
        {
            return Guid.NewGuid().ToString("N")[..16];
        }
    }

    public class LogContent
    {
        public string FileName { get; set; } = "";
        public string FilePath { get; set; } = "";
        public string Content { get; set; } = "";
        public long Size { get; set; }
        public string Encoding { get; set; } = "UTF-8";
    }
}
