using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text;

namespace LensAssemblyMonitoringWeb.Controllers
{

    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class LogController : ControllerBase
    {
        private readonly ILogService _logService;
        private readonly ILogger<LogController> _logger;

        public LogController(
            ILogService logService,
            ILogger<LogController> logger)
        {
            _logService = logService ?? throw new ArgumentNullException(nameof(logService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Receives log directory structure from an agent and enqueues it for batch DB write.
        /// Called by LogStructureSyncService on the C++ agent after debounced directory changes.
        /// </summary>
        [HttpPost("synclogs")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> SyncLogStructure(
            [FromBody] LogStructureSyncRequest request,
            CancellationToken cancellationToken)
        {
            _logger.LogDebug(
                "[SYNC] PC={MCId} structure received, size={Size} bytes",
                request.MCId,
                request.LogStructureJson?.Length ?? 0);

            try
            {
                await _logService.SyncLogStructureAsync(
                    request.MCId,
                    request.LogStructureJson ?? string.Empty,
                    cancellationToken);

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Log structure synced"
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing log structure for PC {MCId}", request.MCId);
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }

        /// <summary>
        /// Receives a filtered, gzip-compressed log file upload with an explicit request ID.
        /// This is the primary upload path used by LogFileUploadService on the C++ agent.
        /// </summary>
        [HttpPost("uploadlog/{requestId}")]
        public async Task<IActionResult> UploadLogWithRequestId(string requestId, [FromForm] string? modelName, [FromForm] string? MCId, IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("Empty File");
            }

            try
            {
                var compressedContent = await ProcessUploadedFile(file, Request.Headers);
                var completed = _logService.CompleteLogRequest(requestId, compressedContent);
                
                return Ok(completed ? "Log received" : "Request not found or expired");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling upload with ID {RequestId}", requestId);
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// JSON-based log upload (alternative to multipart form).
        /// </summary>
        [HttpPost("uploadlog")]
        [Consumes("application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        public ActionResult<ApiResponse> UploadLogJson([FromBody] LogUploadRequest request)
        {
            if (string.IsNullOrEmpty(request.RequestId))
            {
                return BadRequest(new ApiResponse { Success = false, Message = "Request ID required" });
            }

            var content = new CompressedLogContent
            {
                FileName = request.FileName,
                CompressedData = Convert.FromBase64String(request.CompressedContent ?? ""),
                CompressedSize = request.CompressedSize,
                OriginalSize = request.OriginalSize
            };

            var completed = _logService.CompleteLogRequest(request.RequestId, content);

            return Ok(new ApiResponse
            {
                Success = completed,
                Message = completed ? "Log received" : "Request not found or expired"
            });
        }

        [HttpGet("cachestats")]
        [ProducesResponseType(typeof(CacheStats), StatusCodes.Status200OK)]
        public ActionResult<CacheStats> GetCacheStats()
        {
            return Ok(_logService.GetCacheStats());
        }

        private async Task<CompressedLogContent> ProcessUploadedFile(IFormFile file, IHeaderDictionary headers)
        {
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var fileBytes = memoryStream.ToArray();

            byte[] compressedBytes;
            long originalSize;

            bool isGzipCompressed = fileBytes.Length >= 2 && fileBytes[0] == 0x1F && fileBytes[1] == 0x8B;

            if (isGzipCompressed)
            {
                compressedBytes = fileBytes;
                var originalSizeHeader = headers["X-Original-Size"].FirstOrDefault();
                originalSize = long.TryParse(originalSizeHeader, out var size) ? size : fileBytes.Length * 10;
            }
            else
            {
                originalSize = fileBytes.Length;
                using var compressStream = new MemoryStream();
                using (var gzipStream = new System.IO.Compression.GZipStream(compressStream, System.IO.Compression.CompressionLevel.Fastest))
                {
                    gzipStream.Write(fileBytes, 0, fileBytes.Length);
                }
                compressedBytes = compressStream.ToArray();
            }

            return new CompressedLogContent
            {
                FileName = file.FileName,
                CompressedData = compressedBytes,
                CompressedSize = compressedBytes.Length,
                OriginalSize = originalSize
            };
        }
    }

    public class LogUploadRequest
    {
        public string RequestId { get; set; } = "";
        public string FileName { get; set; } = "";
        public string? CompressedContent { get; set; }
        public long CompressedSize { get; set; }
        public long OriginalSize { get; set; }
    }
}

