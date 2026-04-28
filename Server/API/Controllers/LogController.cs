using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Log;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models.Exceptions;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;

namespace LensAssemblyMonitoringWeb.Controllers
{

    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class LogController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogService _logService;
        private readonly ILogger<LogController> _logger;
        private readonly LensAssemblyDbContext _context;

        public LogController(
            ICommandDispatcher dispatcher,
            ILogService logService,
            LensAssemblyDbContext context,
            ILogger<LogController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logService = logService ?? throw new ArgumentNullException(nameof(logService));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        [HttpPost("synclogs")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> SyncLogStructure(
            [FromBody] LogStructureSyncRequest request,
            CancellationToken cancellationToken)
        {
            _logger.LogInformation(
                "[SYNC TIMING] PC={MCId} arrived at {Time}",
                request.MCId,
                DateTime.Now.ToString("HH:mm:ss.fff"));

            try
            {
                var command = new SyncLogStructureCommand(request.MCId, request.LogStructureJson);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                _logger.LogInformation(
                    "[SYNC TIMING] PC={MCId} saved at {Time}",
                    request.MCId,
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

        [HttpPost("uploadlog")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadLogLegacy([FromForm] string? modelName, [FromForm] string? MCId, IFormFile file)
        {
            
            string? pcIdStr = !string.IsNullOrWhiteSpace(MCId) ? MCId : modelName;
            
            if (!int.TryParse(pcIdStr, out int pcIdValue) || file == null || file.Length == 0)
            {
                _logger.LogWarning("Invalid legacy upload attempt. MCId: {MCId}, File: {File}", pcIdStr, file?.FileName);
                return BadRequest("Invalid PC ID or Empty File");
            }

            try
            {
                
                var compressedContent = await ProcessUploadedFile(file, Request.Headers);

                var pendingCmd = await _context.AgentCommands
                    .Where(c => c.MCId == pcIdValue
                             && (c.CommandType == "UPLOAD_LOG" || c.CommandType == "GetLogFileContent")
                             && (c.Status == "Pending" || c.Status == "InProgress"))
                    .OrderByDescending(c => c.CreatedDate)
                    .FirstOrDefaultAsync();

                if (pendingCmd == null)
                {
                    _logger.LogWarning("No active log request found for PC {MCId}", pcIdValue);
                    return NotFound($"No active log request found for PC {pcIdValue}.");
                }

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
                    
                }

                if (string.IsNullOrEmpty(requestId))
                {
                    
                    return await HandleClassicLegacyUpload(pendingCmd, file);
                }

                var completed = _logService.CompleteLogRequest(requestId, compressedContent);

                pendingCmd.Status = "Completed";
                pendingCmd.ExecutedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                return Ok("Log received via legacy endpoint");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling legacy upload for PC {MCId}", pcIdValue);
                return StatusCode(500, ex.Message);
            }
        }

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
                _logger.LogError(ex, "Error handling upload with ID");
                return StatusCode(500, ex.Message);
            }
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

        private async Task<IActionResult> HandleClassicLegacyUpload(AgentCommand pendingCmd, IFormFile file)
        {
            
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

        [HttpGet("cachestats")]
        [ProducesResponseType(typeof(CacheStats), StatusCodes.Status200OK)]
        public ActionResult<CacheStats> GetCacheStats()
        {
            return Ok(_logService.GetCacheStats());
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

