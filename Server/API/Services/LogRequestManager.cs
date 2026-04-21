using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;
using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Services
{

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

        public async Task<LogContent> GetOrFetchAsync(int MCId, string filePath, Func<string, Task> notifyAgent)
        {
            string cacheKey = $"log_{MCId}_{filePath}";

            if (_cache.TryGetValue(cacheKey, out CompressedLogContent? cached) && cached != null)
            {
                return Decompress(cached, filePath);
            }

            var fetchTask = _inFlightFetches.GetOrAdd(cacheKey, _ => FetchFromAgentAsync(MCId, filePath, notifyAgent));

            try
            {
                var compressedResult = await fetchTask;

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

        private async Task<CompressedLogContent> FetchFromAgentAsync(int MCId, string filePath, Func<string, Task> notifyAgent)
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

        public bool CompleteRequest(string requestId, CompressedLogContent content)
        {
            if (_pendingRequests.TryRemove(requestId, out var tcs))
            {
                return tcs.TrySetResult(content);
            }
            return false;
        }

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

                return new LogContent
                {
                    FileName = compressed.FileName,
                    FilePath = filePath,
                    Content = Encoding.UTF8.GetString(compressed.CompressedData), 
                    Size = compressed.OriginalSize,
                    Encoding = "UTF-8"
                };
            }
        }

        public bool HasPendingRequest(string requestId) => _pendingRequests.ContainsKey(requestId);

        public string GenerateRequestId() => Guid.NewGuid().ToString("N")[..16];
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

