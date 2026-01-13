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
