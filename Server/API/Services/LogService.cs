using LensAssemblyMonitoringWeb.Models.Configuration;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;

namespace LensAssemblyMonitoringWeb.Services
{

    public class LogService : ILogService
    {
        private readonly ILogCache _cache;
        private readonly ILogger<LogService> _logger;
        private readonly LogSettings _settings;
        private readonly LogStructureQueue _writeQueue;
        private readonly IHubContext<AgentHub> _hubContext;

        private readonly ConcurrentDictionary<string, TaskCompletionSource<CompressedLogContent>> _pendingRequests;

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

        public async Task<LogContentResult> GetLogContentAsync(
            int MCId,
            string logFilePath,
            CancellationToken cancellationToken = default)
        {
            var correlationId = CorrelationContext.CorrelationId;
            var cacheKey = _cache.GenerateKey(MCId, logFilePath);

            if (string.IsNullOrWhiteSpace(logFilePath))
            {
                return LogContentResult.Failed("Log file path cannot be empty");
            }

            _logger.LogDebug(
                "Getting log content for PC {MCId}, path: {Path}",
                MCId,
                logFilePath);

            try
            {
                var isCurrentHour = IsCurrentHourLog(logFilePath);

                if (!isCurrentHour)
                {
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
                }
                else
                {
                    _logger.LogDebug("Skipping cache for current-hour log: {Path}", logFilePath);
                }

                var fetchTask = _inFlightFetches.GetOrAdd(cacheKey, _ =>
                    FetchFromAgentAsync(MCId, logFilePath, cancellationToken));

                try
                {
                    var result = await fetchTask;

                    if (!isCurrentHour)
                    {
                        _cache.Set(cacheKey, result);
                    }

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
                _logger.LogWarning(ex, "Timeout fetching log from PC {MCId}", MCId);
                return LogContentResult.Failed("Agent did not respond in time");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching log from PC {MCId}", MCId);
                return LogContentResult.Failed($"Failed to fetch log: {ex.Message}");
            }
        }

        public async Task SyncLogStructureAsync(
            int MCId,
            string logStructureJson,
            CancellationToken cancellationToken = default)
        {

            _logger.LogDebug(
                "Enqueuing log structure sync for PC {MCId}, size: {Size} bytes. Queue depth: {Count}",
                MCId,
                logStructureJson?.Length ?? 0,
                _writeQueue.Count);

            await _writeQueue.EnqueueAsync(
                new LogStructureUpdate(MCId, logStructureJson ?? string.Empty), 
                cancellationToken);
        }

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

        private async Task<CompressedLogContent> FetchFromAgentAsync(
            int MCId,
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
                    "Requesting log from agent PC {MCId}, request: {RequestId}",
                    MCId,
                    requestId);

                await _hubContext.Clients.Group(MCId.ToString())
                    .SendAsync("ReceiveCommand", "UPLOAD_LOG", logFilePath, requestId);

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
                
                return Encoding.UTF8.GetString(compressed.CompressedData);
            }
        }

        private static string GenerateRequestId() =>
            Guid.NewGuid().ToString("N")[..16];

        private static bool IsCurrentHourLog(string logFilePath)
        {
            var fileName = Path.GetFileName(logFilePath);
            if (string.IsNullOrEmpty(fileName) || fileName.Length < 10)
            {
                return false;
            }

            var dateHourPrefix = fileName[..10];
            var currentHourPrefix = DateTime.Now.ToString("yyyyMMddHH");

            return dateHourPrefix == currentHourPrefix;
        }
    }
}

