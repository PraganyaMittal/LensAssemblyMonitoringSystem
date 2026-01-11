using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Manages log file requests with compressed caching and concurrent request deduplication.
    /// Stores compressed bytes directly from Agent - no recompression.
    /// </summary>
    public class LogRequestManager
    {
        private readonly IMemoryCache _cache;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<CompressedLogContent>> _pendingRequests;
        private readonly ConcurrentDictionary<string, Task<CompressedLogContent>> _inFlightFetches;
        private readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);
        private readonly TimeSpan _requestTimeout = TimeSpan.FromSeconds(60);

        public LogRequestManager(IMemoryCache cache)
        {
            _cache = cache;
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<CompressedLogContent>>();
            _inFlightFetches = new ConcurrentDictionary<string, Task<CompressedLogContent>>();
        }

        /// <summary>
        /// Gets log content from cache (decompressing if needed), or fetches from Agent.
        /// </summary>
        public async Task<LogContent> GetOrFetchAsync(int pcId, string filePath, Func<string, Task> notifyAgent)
        {
            string cacheKey = $"log_{pcId}_{filePath}";

            // Check cache first (stored compressed)
            if (_cache.TryGetValue(cacheKey, out CompressedLogContent? cached) && cached != null)
            {
                return Decompress(cached, filePath);
            }

            // Check if another request is already fetching this file
            var fetchTask = _inFlightFetches.GetOrAdd(cacheKey, _ => FetchFromAgentAsync(pcId, filePath, notifyAgent));

            try
            {
                var compressedResult = await fetchTask;
                
                // Cache the compressed bytes (uses less memory)
                var cacheOptions = new MemoryCacheEntryOptions()
                    .SetSize(compressedResult.CompressedSize)
                    .SetAbsoluteExpiration(_cacheExpiration);
                _cache.Set(cacheKey, compressedResult, cacheOptions);
                
                return Decompress(compressedResult, filePath);
            }
            finally
            {
                _inFlightFetches.TryRemove(cacheKey, out _);
            }
        }

        private async Task<CompressedLogContent> FetchFromAgentAsync(int pcId, string filePath, Func<string, Task> notifyAgent)
        {
            string requestId = GenerateRequestId();
            var tcs = new TaskCompletionSource<CompressedLogContent>(TaskCreationOptions.RunContinuationsAsynchronously);

            _pendingRequests[requestId] = tcs;

            try
            {
                await notifyAgent(requestId);

                using var cts = new CancellationTokenSource(_requestTimeout);
                using var reg = cts.Token.Register(() => tcs.TrySetException(new TimeoutException("Agent did not respond")));

                return await tcs.Task;
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
            }
        }

        /// <summary>
        /// Called by uploadlog endpoint. Stores compressed bytes directly - no recompression.
        /// </summary>
        public bool CompleteRequest(string requestId, CompressedLogContent content)
        {
            if (_pendingRequests.TryRemove(requestId, out var tcs))
            {
                return tcs.TrySetResult(content);
            }
            return false;
        }

        /// <summary>
        /// Decompress GZIP bytes to string (only when serving to UI).
        /// </summary>
        private LogContent Decompress(CompressedLogContent compressed, string filePath)
        {
            try
            {
                using var compressedStream = new MemoryStream(compressed.CompressedData);
                using var gzipStream = new GZipStream(compressedStream, CompressionMode.Decompress);
                using var reader = new StreamReader(gzipStream, Encoding.UTF8);
                
                return new LogContent
                {
                    FileName = compressed.FileName,
                    FilePath = filePath,
                    Content = reader.ReadToEnd(),
                    Size = compressed.OriginalSize,
                    Encoding = "UTF-8"
                };
            }
            catch (Exception)
            {
                // If decompression fails, return the compressed data as-is (might be uncompressed or corrupted)
                // This fallback helps debug if the data isn't actually compressed
                return new LogContent
                {
                    FileName = compressed.FileName,
                    FilePath = filePath,
                    Content = Encoding.UTF8.GetString(compressed.CompressedData), // Risky unless it's text
                    Size = compressed.OriginalSize,
                    Encoding = "UTF-8"
                };
            }
        }

        public bool HasPendingRequest(string requestId) => _pendingRequests.ContainsKey(requestId);

        public string GenerateRequestId() => Guid.NewGuid().ToString("N")[..16];
    }

    /// <summary>
    /// Compressed log content stored in cache.
    /// </summary>
    public class CompressedLogContent
    {
        public string FileName { get; set; } = "";
        public byte[] CompressedData { get; set; } = Array.Empty<byte>();
        public long CompressedSize { get; set; }
        public long OriginalSize { get; set; }
    }

    /// <summary>
    /// Decompressed log content returned to UI.
    /// </summary>
    public class LogContent
    {
        public string FileName { get; set; } = "";
        public string FilePath { get; set; } = "";
        public string Content { get; set; } = "";
        public long Size { get; set; }
        public string Encoding { get; set; } = "UTF-8";
    }
}
