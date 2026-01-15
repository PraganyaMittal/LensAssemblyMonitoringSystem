using FactoryMonitoringWeb.Models.Configuration;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Log service with request deduplication and caching.
    /// 
    /// Design Decisions:
    /// 1. Request Deduplication: 50 concurrent requests for same file = 1 agent request
    /// 2. LRU Cache: Frequently accessed logs stay in memory
    /// 3. Compressed Storage: GZIP bytes stored directly, decompressed on-demand
    /// 4. Smart Timeout: Based on expected file size
    /// 
    /// Thread Safety: Uses ConcurrentDictionary for in-flight request tracking.
    /// </summary>
    public class LogService : ILogService
    {
        private readonly ILogCache _cache;
        private readonly ILogger<LogService> _logger;
        private readonly LogSettings _settings;
        private readonly LogStructureQueue _writeQueue;
        private readonly IHubContext<AgentHub> _hubContext;

        /// <summary>
        /// Pending requests awaiting agent response.
        /// Key: requestId, Value: TaskCompletionSource for the result
        /// </summary>
        private readonly ConcurrentDictionary<string, TaskCompletionSource<CompressedLogContent>> _pendingRequests;

        /// <summary>
        /// In-flight fetches to prevent duplicate agent requests.
        /// Key: cache key, Value: Task for the fetch
        /// </summary>
        private readonly ConcurrentDictionary<string, Task<CompressedLogContent>> _inFlightFetches;

        public LogService(
            ILogCache cache,
            ILogger<LogService> logger,
            IOptions<LogSettings> settings,
            LogStructureQueue writeQueue,
            IHubContext<AgentHub> hubContext)
        {
            _cache = cache ?? throw new ArgumentNullException(nameof(cache));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? new LogSettings();
            _writeQueue = writeQueue ?? throw new ArgumentNullException(nameof(writeQueue));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));

            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<CompressedLogContent>>();
            _inFlightFetches = new ConcurrentDictionary<string, Task<CompressedLogContent>>();

            _logger.LogInformation(
                "LogService initialized with timeout: {Timeout}s, cache limit: {CacheMB}MB",
                _settings.CalculatedTimeout.TotalSeconds,
                _settings.CacheSizeLimitMB);
        }

        /// <inheritdoc/>
        public async Task<LogContentResult> GetLogContentAsync(
            int pcId,
            string logFilePath,
            CancellationToken cancellationToken = default)
        {
            var correlationId = CorrelationContext.CorrelationId;
            var cacheKey = _cache.GenerateKey(pcId, logFilePath);

            if (string.IsNullOrWhiteSpace(logFilePath))
            {
                return LogContentResult.Failed("Log file path cannot be empty");
            }

            _logger.LogDebug(
                "Getting log content for PC {PCId}, path: {Path}",
                pcId,
                logFilePath);

            try
            {
                // Step 1: Check cache first
                var cached = _cache.Get(cacheKey);
                if (cached != null)
                {
                    _logger.LogDebug("Cache hit for {Key}", cacheKey);
                    var decompressed = Decompress(cached, logFilePath);
                    return LogContentResult.Succeeded(
                        cached.FileName,
                        logFilePath,
                        decompressed,
                        cached.OriginalSize,
                        fromCache: true);
                }

                // Step 2: Check if another request is already fetching this file
                var fetchTask = _inFlightFetches.GetOrAdd(cacheKey, _ =>
                    FetchFromAgentAsync(pcId, logFilePath, cancellationToken));

                try
                {
                    var result = await fetchTask;

                    // Cache the result
                    _cache.Set(cacheKey, result);

                    var content = Decompress(result, logFilePath);
                    return LogContentResult.Succeeded(
                        result.FileName,
                        logFilePath,
                        content,
                        result.OriginalSize,
                        fromCache: false);
                }
                finally
                {
                    _inFlightFetches.TryRemove(cacheKey, out _);
                }
            }
            catch (TimeoutException ex)
            {
                _logger.LogWarning(ex, "Timeout fetching log from PC {PCId}", pcId);
                return LogContentResult.Failed("Agent did not respond in time");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching log from PC {PCId}", pcId);
                return LogContentResult.Failed($"Failed to fetch log: {ex.Message}");
            }
        }

        /// <inheritdoc/>
        public async Task SyncLogStructureAsync(
            int pcId,
            string logStructureJson,
            CancellationToken cancellationToken = default)
        {
            // RELIABLE BATCHING: Fire-and-Forget with SignalR Recovery
            // We enqueue the update and return immediately for maximum throughput.
            // If the batch fails, the Background Processor will notify the agent via SignalR to retry.
            
            _logger.LogDebug(
                "Enqueuing log structure sync for PC {PCId}, size: {Size} bytes. Queue depth: {Count}",
                pcId,
                logStructureJson?.Length ?? 0,
                _writeQueue.Count);

            await _writeQueue.EnqueueAsync(
                new LogStructureUpdate(pcId, logStructureJson), 
                cancellationToken);
        }

        /// <inheritdoc/>
        public bool CompleteLogRequest(string requestId, CompressedLogContent content)
        {
            if (_pendingRequests.TryRemove(requestId, out var tcs))
            {
                _logger.LogDebug(
                    "Completing log request {RequestId}, size: {Size} bytes",
                    requestId,
                    content.CompressedSize);
                return tcs.TrySetResult(content);
            }

            _logger.LogWarning("No pending request found for {RequestId}", requestId);
            return false;
        }

        /// <inheritdoc/>
        public CacheStats GetCacheStats()
        {
            return _cache.GetStats();
        }

        /// <summary>
        /// Fetches log content from agent via SignalR.
        /// </summary>
        private async Task<CompressedLogContent> FetchFromAgentAsync(
            int pcId,
            string logFilePath,
            CancellationToken cancellationToken)
        {
            var requestId = GenerateRequestId();
            var tcs = new TaskCompletionSource<CompressedLogContent>(
                TaskCreationOptions.RunContinuationsAsynchronously);

            _pendingRequests[requestId] = tcs;

            try
            {
                _logger.LogDebug(
                    "Requesting log from agent PC {PCId}, request: {RequestId}",
                    pcId,
                    requestId);

                // Notify agent to upload the log file
                await _hubContext.Clients.Group(pcId.ToString())
                    .SendAsync("ReceiveCommand", "UPLOAD_LOG", logFilePath, requestId);

                // Wait for agent response with timeout
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(_settings.CalculatedTimeout);

                using var reg = cts.Token.Register(() =>
                    tcs.TrySetException(new TimeoutException(
                        $"Agent did not respond within {_settings.CalculatedTimeout.TotalSeconds}s")));

                return await tcs.Task;
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
            }
        }

        /// <summary>
        /// Decompresses GZIP content to string.
        /// </summary>
        private string Decompress(CompressedLogContent compressed, string filePath)
        {
            try
            {
                using var compressedStream = new MemoryStream(compressed.CompressedData);
                using var gzipStream = new GZipStream(compressedStream, CompressionMode.Decompress);
                using var reader = new StreamReader(gzipStream, Encoding.UTF8);

                return reader.ReadToEnd();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to decompress log, returning as-is");
                // Fallback: return as raw string (might be uncompressed)
                return Encoding.UTF8.GetString(compressed.CompressedData);
            }
        }

        /// <summary>
        /// Generates unique request ID.
        /// </summary>
        private static string GenerateRequestId() =>
            Guid.NewGuid().ToString("N")[..16];
    }
}
