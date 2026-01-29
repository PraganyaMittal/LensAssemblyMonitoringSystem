using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ThumbnailController : ControllerBase
    {
        private readonly IThumbnailCache _thumbnailCache;
        private readonly ILogger<ThumbnailController> _logger;

        public ThumbnailController(
            IThumbnailCache thumbnailCache,
            ILogger<ThumbnailController> logger)
        {
            _thumbnailCache = thumbnailCache;
            _logger = logger;
        }

        /// <summary>
        /// Upload thumbnails from agent after log file is parsed.
        /// </summary>
        [HttpPost("upload")]
        public IActionResult UploadThumbnails([FromBody] ThumbnailUploadRequest request)
        {
            if (string.IsNullOrEmpty(request.LogFileName) || request.Thumbnails == null)
            {
                return BadRequest(new { error = "Invalid request" });
            }

            _logger.LogInformation("Received {Count} thumbnails for log {LogFileName}",
                request.Thumbnails.Count, request.LogFileName);

            _thumbnailCache.SetThumbnails(request.LogFileName, request.Thumbnails);

            // TODO: Notify UI via SignalR that thumbnails are ready
            // This would require injecting IHubContext<AgentHub>

            return Ok(new { 
                message = "Thumbnails cached", 
                count = request.Thumbnails.Count,
                logFileName = request.LogFileName
            });
        }

        /// <summary>
        /// Get all thumbnails for a log file.
        /// </summary>
        [HttpGet("{logFileName}")]
        public IActionResult GetThumbnails(string logFileName)
        {
            var thumbnails = _thumbnailCache.GetThumbnails(logFileName);
            
            if (thumbnails == null)
            {
                return NotFound(new { error = "Thumbnails not cached for this log file" });
            }

            return Ok(new
            {
                logFileName,
                thumbnails = thumbnails.Select(t => new
                {
                    operationName = t.OperationName,
                    imagePath = t.ImagePath,
                    filename = t.Filename,
                    data = t.Data
                }).ToList(),
                count = thumbnails.Count
            });
        }

        /// <summary>
        /// Get thumbnails for a specific operation within a log file.
        /// </summary>
        [HttpGet("{logFileName}/operation/{operationName}")]
        public IActionResult GetThumbnailsForOperation(string logFileName, string operationName)
        {
            var thumbnails = _thumbnailCache.GetThumbnailsForOperation(logFileName, operationName);
            
            if (thumbnails == null || thumbnails.Count == 0)
            {
                return NotFound(new { error = "No thumbnails found for this operation" });
            }

            return Ok(new
            {
                logFileName,
                operationName,
                thumbnails = thumbnails.Select(t => new
                {
                    filename = t.Filename,
                    imagePath = t.ImagePath,
                    data = t.Data
                }).ToList(),
                count = thumbnails.Count
            });
        }

        /// <summary>
        /// Check if thumbnails are available for a log file.
        /// </summary>
        [HttpGet("{logFileName}/available")]
        public IActionResult CheckAvailability(string logFileName)
        {
            var available = _thumbnailCache.HasThumbnails(logFileName);
            return Ok(new { logFileName, available });
        }
    }
}
