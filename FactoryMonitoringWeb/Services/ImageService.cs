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

        public ImageService(
            IHubContext<AgentHub> hubContext,
            ILogger<ImageService> logger)
        {
            _hubContext = hubContext;
            _logger = logger;
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<List<ImageData>>>();
        }

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
            var requestId = GenerateRequestId();
            var tcs = new TaskCompletionSource<List<ImageData>>(
                TaskCreationOptions.RunContinuationsAsynchronously);

            _pendingRequests[requestId] = tcs;

            try
            {
                // Use imagePath directly if provided, otherwise construct from legacy fields
                string finalImagePath;
                if (!string.IsNullOrEmpty(imagePath))
                {
                    finalImagePath = imagePath;
                    _logger.LogDebug(
                        "Requesting images from agent PC {PCId} using direct path: {ImagePath}",
                        pcId, imagePath);
                }
                else
                {
                    finalImagePath = $"{modelName}\\{trayId}\\{barrelId}\\{inspectionName}";
                    _logger.LogDebug(
                        "Requesting images from agent PC {PCId}, model: {Model}, tray: {Tray}, barrel: {Barrel}, inspection: {Inspection}",
                        pcId, modelName, trayId, barrelId, inspectionName);
                }

                // Send command to agent via SignalR
                await _hubContext.Clients
                    .Group(pcId.ToString())
                    .SendAsync("ReceiveCommand", "UPLOAD_IMAGE", finalImagePath, requestId, cancellationToken);

                // Wait for agent response with timeout
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(_timeout);

                using var reg = cts.Token.Register(() =>
                    tcs.TrySetException(new TimeoutException(
                        $"Agent did not respond within {_timeout.TotalSeconds}s")));

                var images = await tcs.Task;

                return ImageResult.Succeeded(images, inspectionName);
            }
            catch (TimeoutException ex)
            {
                _logger.LogWarning(ex, "Timeout fetching images from PC {PCId}", pcId);
                return ImageResult.Failed("Agent did not respond in time");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching images from PC {PCId}", pcId);
                return ImageResult.Failed($"Failed to fetch images: {ex.Message}");
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
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
        public int Count => Images.Count;

        public static ImageResult Succeeded(List<ImageData> images, string operationName) =>
            new() { Success = true, Images = images, OperationName = operationName };

        public static ImageResult Failed(string errorMessage) =>
            new() { Success = false, ErrorMessage = errorMessage };
    }

    /// <summary>
    /// Individual image data from an inspection.
    /// </summary>
    public class ImageData
    {
        /// <summary>
        /// Base64 encoded GZIP compressed BMP image data.
        /// </summary>
        public string Data { get; set; } = "";

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
