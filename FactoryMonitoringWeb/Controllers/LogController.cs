using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Log;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for log-related endpoints.
    /// 
    /// Endpoints:
    /// - POST /synclogs - Agent syncs log directory structure
    /// - POST /uploadlog - Agent uploads requested log file (Legacy/Fallback)
    /// - POST /uploadlog/{requestId} - Agent uploads requested log file (Modern)
    /// - GET /cachestats - Get cache statistics (monitoring)
    /// </summary>
    [Route("api/agent")]
    [ApiController]
    public class LogController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogService _logService;
        private readonly ILogger<LogController> _logger;
        private readonly FactoryDbContext _context;

        public LogController(
            ICommandDispatcher dispatcher,
            ILogService logService,
            FactoryDbContext context,
            ILogger<LogController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logService = logService ?? throw new ArgumentNullException(nameof(logService));
            _context = context ?? throw new ArgumentNullException(nameof(context));
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
        /// Receives uploaded log file from agent (Modern JSON Protocol).
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

        /// <summary>
        /// Legacy/Fallback Endpoint: Upload without Request ID in URL.
        /// Uses PCID from form to match with pending command.
        /// </summary>
        [HttpPost("uploadlog")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadLogLegacy([FromForm] string? modelName, [FromForm] string? pcId, IFormFile file)
        {
            // Resolve PCID (Handle "modelName" legacy param or "pcId" correct param)
            string? pcIdStr = !string.IsNullOrWhiteSpace(pcId) ? pcId : modelName;
            
            if (!int.TryParse(pcIdStr, out int pcIdValue) || file == null || file.Length == 0)
            {
                _logger.LogWarning("Invalid legacy upload attempt. PCID: {PcId}, File: {File}", pcIdStr, file?.FileName);
                return BadRequest("Invalid PC ID or Empty File");
            }

            try
            {
                // 1. Process File Content
                var compressedContent = await ProcessUploadedFile(file, Request.Headers);

                // 2. Find Pending Command to get Request ID
                var pendingCmd = await _context.AgentCommands
                    .Where(c => c.PCId == pcIdValue
                             && (c.CommandType == "UPLOAD_LOG" || c.CommandType == "GetLogFileContent")
                             && (c.Status == "Pending" || c.Status == "InProgress"))
                    .OrderByDescending(c => c.CreatedDate)
                    .FirstOrDefaultAsync();

                if (pendingCmd == null)
                {
                    _logger.LogWarning("No active log request found for PC {PCId}", pcIdValue);
                    return NotFound($"No active log request found for PC {pcIdValue}.");
                }

                // 3. Extract Request ID
                string? requestId = null;
                try 
                {
                    if (!string.IsNullOrEmpty(pendingCmd.CommandData))
                    {
                        dynamic? cmdData = JsonConvert.DeserializeObject(pendingCmd.CommandData);
                        requestId = cmdData?.RequestId;
                    }
                }
                catch 
                { 
                    // Fallback if not JSON or missing RequestId
                }

                if (string.IsNullOrEmpty(requestId))
                {
                    // Fallback for VERY OLD agents/commands: Update DB directly
                    return await HandleClassicLegacyUpload(pendingCmd, file);
                }

                // 4. Complete Request via Service (Wakes up UI)
                var completed = _logService.CompleteLogRequest(requestId, compressedContent);
                
                // 5. Update Command Status
                pendingCmd.Status = "Completed";
                pendingCmd.ExecutedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                return Ok("Log received via legacy endpoint");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling legacy upload for PC {PCId}", pcIdValue);
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Upload with Request ID in URL.
        /// </summary>
        [HttpPost("uploadlog/{requestId}")]
        public async Task<IActionResult> UploadLogWithRequestId(string requestId, [FromForm] string? modelName, [FromForm] string? pcId, IFormFile file)
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
                _logger.LogError(ex, "Error handling upload with ID");
                return StatusCode(500, ex.Message);
            }
        }

        // --- Helpers ---

        private async Task<CompressedLogContent> ProcessUploadedFile(IFormFile file, IHeaderDictionary headers)
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

        private async Task<IActionResult> HandleClassicLegacyUpload(AgentCommand pendingCmd, IFormFile file)
        {
            // Direct DB update for old agents
            using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
            var content = await reader.ReadToEndAsync();

             var resultData = new Dictionary<string, object>
            {
                { "content", content },
                { "size", file.Length },
                { "encoding", "UTF-8" }
            };

            pendingCmd.ResultData = JsonConvert.SerializeObject(resultData);
            pendingCmd.Status = "Completed";
            pendingCmd.ExecutedDate = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok("Log saved to DB (Legacy Mode)");
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
