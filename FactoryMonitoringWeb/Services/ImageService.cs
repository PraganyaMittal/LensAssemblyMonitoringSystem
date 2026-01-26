using FactoryMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Service for fetching inspection images from factory agents.
    /// Uses SignalR to request images from agents and correlates responses.
    /// </summary>
    public interface IImageService
    {
        /// <summary>
        /// Get inspection images using direct imagePath (preferred) or constructed path.
        /// </summary>
        Task<ImageResult> GetInspectionImagesAsync(
            int pcId,
            string? imagePath = null,
            string? modelName = null,
            string? trayId = null,
            string? barrelId = null,
            string? inspectionName = null,
            CancellationToken cancellationToken = default);

        void CompleteImageRequest(string requestId, List<ImageData> images);
        ImageData? GetImageByIndex(string requestId, int index);
        
        /// <summary>
        /// Lazy load a single image from agent (or cache).
        /// </summary>
        Task<ImageData?> GetSingleImageAsync(int pcId, string imagePath, CancellationToken cancellationToken = default);
    }

    public class ImageService : IImageService
    {
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<ImageService> _logger;

        /// <summary>
        /// Pending requests awaiting agent response.
        /// Key: requestId, Value: TaskCompletionSource for the result
        /// </summary>
        private readonly ConcurrentDictionary<string, TaskCompletionSource<List<ImageData>>> _pendingRequests;

        /// <summary>
        /// Timeout for agent response (images may be large)
        /// </summary>
        private readonly TimeSpan _timeout = TimeSpan.FromSeconds(30);

        // Cache for storing images for subsequent retrieval
        private readonly Microsoft.Extensions.Caching.Memory.IMemoryCache _cache;

        // Limit concurrent uploads per Agent to prevent network saturation (Vietnam link)
        private readonly ConcurrentDictionary<int, SemaphoreSlim> _agentSemaphores = new();
        private const int MAX_CONCURRENT_UPLOADS_PER_AGENT = 2;

        // Request Coalescing ("SingleFlight") - protect against Thundering Herd
        private readonly ConcurrentDictionary<string, Task<ImageData?>> _inflightCoalescing = new();

        public ImageService(
            IHubContext<AgentHub> hubContext,
            ILogger<ImageService> logger,
            Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
        {
            _hubContext = hubContext;
            _logger = logger;
            _cache = cache;
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

        /// <inheritdoc/>
        /// <inheritdoc/>
        public async Task<ImageResult> GetInspectionImagesAsync(
            int pcId,
            string? imagePath = null,
            string? modelName = null,
            string? trayId = null,
            string? barrelId = null,
            string? inspectionName = null,
            CancellationToken cancellationToken = default)
        {
            // Legacy Bulk Fetch Implementation
            // ... (Only used if explicit bulk fetch requested)
            
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
                    .Group(pcId.ToString())
                    .SendAsync("ReceiveCommand", "UPLOAD_IMAGE", finalImagePath, requestId, cancellationToken);

                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(_timeout);

                using var reg = cts.Token.Register(() =>
                    tcs.TrySetException(new TimeoutException($"Agent timeout")));

                var images = await tcs.Task;

                // Cache each image individually for lazy retrieval if needed
                foreach (var img in images)
                {
                    // Cache Key: pcId_filename (Simple collision avoidance)
                    // In production, use full path hash
                    string cacheKey = $"{pcId}_{img.Filename}";
                    
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

        public async Task<ImageData?> GetSingleImageAsync(int pcId, string imagePath, CancellationToken cancellationToken = default)
        {
            // 1. Deterministic Cache Key
            string filename = Path.GetFileName(imagePath);
            string cacheKey = $"{pcId}_{filename}";

            // Check Cache First
            if (_cache.TryGetValue(cacheKey, out object? cachedValue))
            {
                if (cachedValue is ImageData cachedImage)
                {
                    _logger.LogInformation("Lazy Load Cache HIT: {Key}", cacheKey);
                    return cachedImage;
                }
            }

            // 2. Request Coalescing (The "Waiting Room")
            // If multiple users ask for the same image, they all await the SAME Task.
            return await _inflightCoalescing.GetOrAdd(cacheKey, async (key) =>
            {
                try 
                {
                    return await FetchFromAgentWithLockAsync(pcId, imagePath, key, cancellationToken);
                }
                finally
                {
                    // Remove from waiting room immediately after completion
                    _inflightCoalescing.TryRemove(key, out _);
                }
            });
        }

        private async Task<ImageData?> FetchFromAgentWithLockAsync(int pcId, string imagePath, string cacheKey, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Lazy Load Cache MISS: {Key}. Queuing Agent Request...", cacheKey);

            // 3. Semaphore (The "Bouncer")
            // Limit max concurrent uploads per Agent to 2
            var semaphore = _agentSemaphores.GetOrAdd(pcId, new SemaphoreSlim(MAX_CONCURRENT_UPLOADS_PER_AGENT));
            
            // Wait to enter the "VIP Room" (Upload Slot)
            // Timeout after 30s if queue is too long
            if (!await semaphore.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken))
            {
                _logger.LogWarning("Agent {PCId} is too busy! Dropped request for {Path}", pcId, imagePath);
                return null;
            }

            try
            {
                // 4. Actual Fetch (Inside the Lock)
                var requestId = GenerateRequestId();
                var tcs = new TaskCompletionSource<List<ImageData>>(TaskCreationOptions.RunContinuationsAsynchronously);
                _pendingRequests[requestId] = tcs;

                try
                {
                    await _hubContext.Clients.Group(pcId.ToString())
                        .SendAsync("ReceiveCommand", "UPLOAD_IMAGE", imagePath, requestId, cancellationToken);

                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    cts.CancelAfter(TimeSpan.FromSeconds(20)); // Upload Timeout
                    
                    using var reg = cts.Token.Register(() => tcs.TrySetException(new TimeoutException("Agent upload timeout")));

                    var result = await tcs.Task;
                    var img = result.FirstOrDefault();

                    if (img != null)
                    {
                        using (var entry = _cache.CreateEntry(cacheKey))
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
                // ALWAYS Release the lock
                semaphore.Release();
            }
        }

        /// <inheritdoc/>
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

    /// <summary>
    /// Result of an image fetch operation.
    /// </summary>
    public class ImageResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }
        public List<ImageData> Images { get; init; } = new();
        public string OperationName { get; init; } = "";
        public string RequestId { get; init; } = ""; // Added RequestId
        public int Count => Images.Count;

        public static ImageResult Succeeded(List<ImageData> images, string operationName, string requestId) =>
            new() { Success = true, Images = images, OperationName = operationName, RequestId = requestId };

        public static ImageResult Failed(string errorMessage) =>
            new() { Success = false, ErrorMessage = errorMessage };
    }

    public class ImageData
    {
        /// <summary>
        /// Raw binary image data (BMP/GZIP).
        /// </summary>
        public byte[] Data { get; set; } = Array.Empty<byte>();

        /// <summary>
        /// Original filename (with timestamp).
        /// </summary>
        public string Filename { get; set; } = "";
    }

    /// <summary>
    /// Request model for fetching inspection images.
    /// </summary>
    public class InspectionImageRequest
    {
        /// <summary>Direct image path from NGImage log (preferred)</summary>
        public string? ImagePath { get; set; }
        /// <summary>Model name (legacy, used if ImagePath not provided)</summary>
        public string? ModelName { get; set; }
        /// <summary>Tray ID (legacy)</summary>
        public string? TrayId { get; set; }
        /// <summary>Barrel ID</summary>
        public string? BarrelId { get; set; }
        /// <summary>Inspection folder name (legacy)</summary>
        public string? InspectionName { get; set; }
    }
}
