using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;

namespace LensAssemblyMonitoringWeb.Services
{

    public interface IImageService
    {

        Task<ImageResult> GetInspectionImagesAsync(
            int MCId,
            string? imagePath = null,
            string? modelName = null,
            string? trayId = null,
            string? barrelId = null,
            string? inspectionName = null,
            CancellationToken cancellationToken = default);

        void CompleteImageRequest(string requestId, List<ImageData> images);
        ImageData? GetImageByIndex(string requestId, int index);

        Task<ImageData?> GetSingleImageAsync(int MCId, string imagePath, CancellationToken cancellationToken = default);
    }

    public class ImageService : IImageService
    {
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<ImageService> _logger;

        private readonly ConcurrentDictionary<string, TaskCompletionSource<List<ImageData>>> _pendingRequests;

        private readonly TimeSpan _timeout = TimeSpan.FromSeconds(30);

        private readonly Microsoft.Extensions.Caching.Memory.IMemoryCache _cache;

        private readonly Microsoft.Extensions.Caching.Memory.IMemoryCache _semaphoreCache;
        private const int MAX_CONCURRENT_UPLOADS_PER_AGENT = 2;

        private readonly ConcurrentDictionary<string, Task<ImageData?>> _inflightCoalescing = new();

        public ImageService(
            IHubContext<AgentHub> hubContext,
            ILogger<ImageService> logger,
            Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
        {
            _hubContext = hubContext;
            _logger = logger;
            _cache = cache;
            _semaphoreCache = new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions());
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<List<ImageData>>>();
        }

        public ImageData? GetImageByIndex(string requestId, int index)
        {
            if (_cache.TryGetValue(requestId, out object? value))
            {
                if (value is List<ImageData> images)
                {
                    if (images != null && index >= 0 && index < images.Count)
                    {
                        return images[index];
                    }
                    _logger.LogWarning("Cache Hit but Index Invalid: Count={Count}, Index={Index}", images?.Count, index);
                }
                else
                {
                    _logger.LogWarning("Cache Hit but Type Mismatch: Type={Type}", value?.GetType().Name);
                }
            }
            else
            {
                _logger.LogWarning("Cache MISS for RequestId={RequestId}", requestId);
            }
            return null;
        }

        public async Task<ImageResult> GetInspectionImagesAsync(
            int MCId,
            string? imagePath = null,
            string? modelName = null,
            string? trayId = null,
            string? barrelId = null,
            string? inspectionName = null,
            CancellationToken cancellationToken = default)
        {

            var requestId = GenerateRequestId();
            var tcs = new TaskCompletionSource<List<ImageData>>(
                TaskCreationOptions.RunContinuationsAsynchronously);

            _pendingRequests[requestId] = tcs;

            try
            {
                string finalImagePath;
                if (!string.IsNullOrEmpty(imagePath))
                {
                    finalImagePath = imagePath;
                }
                else
                {
                    finalImagePath = $"{modelName}\\{trayId}\\{barrelId}\\{inspectionName}";
                }

                await _hubContext.Clients
                    .Group(MCId.ToString())
                    .SendAsync("ReceiveCommand", "UPLOAD_IMAGE", finalImagePath, requestId, cancellationToken);

                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(_timeout);

                using var reg = cts.Token.Register(() =>
                    tcs.TrySetException(new TimeoutException($"Agent timeout")));

                var images = await tcs.Task;

                // Cache the full batch under requestId for the image-content/{requestId}/{index} endpoint
                using (var batchEntry = _cache.CreateEntry(requestId))
                {
                    batchEntry.Value = images;
                    batchEntry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                    batchEntry.Size = images.Sum(img => img.Data.Length > 0 ? img.Data.Length : 1);
                }

                // Also cache individual images by path-qualified key for single-image lookups
                foreach (var img in images)
                {
                    string cacheKey = $"{MCId}_{finalImagePath}_{img.Filename}";
                    
                    using (var entry = _cache.CreateEntry(cacheKey))
                    {
                        entry.Value = img;
                        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
                        entry.Size = img.Data.Length > 0 ? img.Data.Length : 1;
                    }
                }

                return ImageResult.Succeeded(images, inspectionName ?? "Unknown", requestId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching images");
                return ImageResult.Failed(ex.Message);
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
            }
        }

        public async Task<ImageData?> GetSingleImageAsync(int MCId, string imagePath, CancellationToken cancellationToken = default)
        {
            // Use path-qualified key to avoid collisions between different inspections
            string dirPath = Path.GetDirectoryName(imagePath)?.Replace('\\', '/') ?? "";
            string filename = Path.GetFileName(imagePath);
            string cacheKey = $"{MCId}_{dirPath}_{filename}";

            if (_cache.TryGetValue(cacheKey, out object? cachedValue))
            {
                if (cachedValue is ImageData cachedImage)
                {
                    _logger.LogInformation("Lazy Load Cache HIT: {Key}", cacheKey);
                    return cachedImage;
                }
            }

            return await _inflightCoalescing.GetOrAdd(cacheKey, async (key) =>
            {
                try 
                {
                    return await FetchFromAgentWithLockAsync(MCId, imagePath, key, cancellationToken);
                }
                finally
                {
                    
                    _inflightCoalescing.TryRemove(key, out _);
                }
            });
        }

        private async Task<ImageData?> FetchFromAgentWithLockAsync(int MCId, string imagePath, string cacheKey, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Lazy Load Cache MISS: {Key}. Queuing Agent Request...", cacheKey);

            var semaphore = _semaphoreCache.GetOrCreate(MCId, entry =>
            {
                entry.SlidingExpiration = TimeSpan.FromMinutes(10);
                entry.RegisterPostEvictionCallback((key, value, reason, state) =>
                {
                    if (value is SemaphoreSlim s)
                    {
                        s.Dispose();
                    }
                });
                return new SemaphoreSlim(MAX_CONCURRENT_UPLOADS_PER_AGENT);
            });

            if (semaphore == null || !await semaphore.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken))
            {
                _logger.LogWarning("Agent {MCId} is too busy! Dropped request for {Path}", MCId, imagePath);
                return null;
            }

            try
            {
                
                var requestId = GenerateRequestId();
                var tcs = new TaskCompletionSource<List<ImageData>>(TaskCreationOptions.RunContinuationsAsynchronously);
                _pendingRequests[requestId] = tcs;

                try
                {
                    await _hubContext.Clients.Group(MCId.ToString())
                        .SendAsync("ReceiveCommand", "UPLOAD_IMAGE", imagePath, requestId, cancellationToken);

                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    cts.CancelAfter(TimeSpan.FromSeconds(20)); 
                    
                    using var reg = cts.Token.Register(() => tcs.TrySetException(new TimeoutException("Agent upload timeout")));

                    var result = await tcs.Task;
                    var img = result.FirstOrDefault();

                    if (img != null)
                    {
                        // Use path-qualified cache key consistent with GetSingleImageAsync
                        string dirPath = Path.GetDirectoryName(imagePath)?.Replace('\\', '/') ?? "";
                        string pathKey = $"{MCId}_{dirPath}_{img.Filename}";
                        using (var entry = _cache.CreateEntry(pathKey))
                        {
                            entry.Value = img;
                            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
                            entry.Size = img.Data.Length > 0 ? img.Data.Length : 1;
                        }
                        return img;
                    }
                    return null;
                }
                finally
                {
                    _pendingRequests.TryRemove(requestId, out _);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to lazy load image {Path}", imagePath);
                return null;
            }
            finally
            {
                
                semaphore?.Release();
            }
        }

        public void CompleteImageRequest(string requestId, List<ImageData> images)
        {
            if (_pendingRequests.TryGetValue(requestId, out var tcs))
            {
                _logger.LogDebug(
                    "Completing image request {RequestId} with {Count} images",
                    requestId, images.Count);

                tcs.TrySetResult(images);
            }
            else
            {
                _logger.LogWarning(
                    "No pending request found for requestId {RequestId}",
                    requestId);
            }
        }

        private static string GenerateRequestId()
        {
            return $"img_{Guid.NewGuid():N}";
        }
    }

    public class ImageResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }
        public List<ImageData> Images { get; init; } = new();
        public string OperationName { get; init; } = "";
        public string RequestId { get; init; } = ""; 
        public int Count => Images.Count;

        public static ImageResult Succeeded(List<ImageData> images, string operationName, string requestId) =>
            new() { Success = true, Images = images, OperationName = operationName, RequestId = requestId };

        public static ImageResult Failed(string errorMessage) =>
            new() { Success = false, ErrorMessage = errorMessage };
    }

    public class ImageData
    {

        public byte[] Data { get; set; } = Array.Empty<byte>();

        public string Filename { get; set; } = "";
    }

    public class InspectionImageRequest
    {

        public string? ImagePath { get; set; }

        public string? ModelName { get; set; }

        public string? TrayId { get; set; }

        public string? BarrelId { get; set; }

        public string? InspectionName { get; set; }
    }
}

