using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Log;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for log-related endpoints.
    /// 
    /// Endpoints:
    /// - POST /synclogs - Agent syncs log directory structure
    /// - POST /uploadlog - Agent uploads requested log file
    /// - GET /cachestats - Get cache statistics (monitoring)
    /// </summary>
    [Route("api/agent")]
    [ApiController]
    public class LogController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogService _logService;
        private readonly ILogger<LogController> _logger;

        public LogController(
            ICommandDispatcher dispatcher,
            ILogService logService,
            ILogger<LogController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logService = logService ?? throw new ArgumentNullException(nameof(logService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Syncs log directory structure from agent.
        /// </summary>
        [HttpPost("synclogs")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> SyncLogStructure(
            [FromBody] LogStructureSyncRequest request,
            CancellationToken cancellationToken)
        {
            _logger.LogInformation(
                "[SYNC TIMING] PC={PCId} arrived at {Time}",
                request.PCId,
                DateTime.Now.ToString("HH:mm:ss.fff"));

            try
            {
                var command = new SyncLogStructureCommand(request.PCId, request.LogStructureJson);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                _logger.LogInformation(
                    "[SYNC TIMING] PC={PCId} saved at {Time}",
                    request.PCId,
                    DateTime.Now.ToString("HH:mm:ss.fff"));

                return Ok(new ApiResponse
                {
                    Success = result.Success,
                    Message = result.Message
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing log structure");
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }

        /// <summary>
        /// Receives uploaded log file from agent.
        /// Called when agent responds to log file request.
        /// </summary>
        [HttpPost("uploadlog")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        public ActionResult<ApiResponse> UploadLog([FromBody] LogUploadRequest request)
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

        /// <summary>
        /// (Legacy Protocol) Receive log file from Agent. Support IFormFile and raw Gzip.
        /// </summary>
        [HttpPost("uploadlog/{requestId}")]
        public async Task<IActionResult> UploadLogWithRequestId(string requestId, [FromForm] string modelName, IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("Empty File");
            }

            try
            {
                using var memoryStream = new MemoryStream();
                await file.CopyToAsync(memoryStream);
                var fileBytes = memoryStream.ToArray();

                byte[] compressedBytes;
                long originalSize;

                // Check if already GZIP compressed (magic bytes: 1F 8B)
                bool isGzipCompressed = fileBytes.Length >= 2 && fileBytes[0] == 0x1F && fileBytes[1] == 0x8B;

                if (isGzipCompressed)
                {
                    // Already compressed by Agent - use directly
                    compressedBytes = fileBytes;
                    var originalSizeHeader = Request.Headers["X-Original-Size"].FirstOrDefault();
                    originalSize = long.TryParse(originalSizeHeader, out var size) ? size : fileBytes.Length * 10;
                }
                else
                {
                    // Uncompressed - compress on server (one-time cost)
                    originalSize = fileBytes.Length;
                    using var compressStream = new MemoryStream();
                    using (var gzipStream = new System.IO.Compression.GZipStream(compressStream, System.IO.Compression.CompressionLevel.Fastest))
                    {
                        gzipStream.Write(fileBytes, 0, fileBytes.Length);
                    }
                    compressedBytes = compressStream.ToArray();
                }

                var compressedContent = new CompressedLogContent
                {
                    FileName = file.FileName,
                    CompressedData = compressedBytes,
                    CompressedSize = compressedBytes.Length,
                    OriginalSize = originalSize
                };

                var completed = _logService.CompleteLogRequest(requestId, compressedContent);
                
                return Ok(completed ? "Log received" : "Request not found or expired");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling legacy log upload");
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Gets cache statistics for monitoring.
        /// </summary>
        [HttpGet("cachestats")]
        [ProducesResponseType(typeof(CacheStats), StatusCodes.Status200OK)]
        public ActionResult<CacheStats> GetCacheStats()
        {
            return Ok(_logService.GetCacheStats());
        }
    }

    /// <summary>
    /// Request for uploading log file content.
    /// </summary>
    public class LogUploadRequest
    {
        public string RequestId { get; set; } = "";
        public string FileName { get; set; } = "";
        public string? CompressedContent { get; set; }
        public long CompressedSize { get; set; }
        public long OriginalSize { get; set; }
    }
}
