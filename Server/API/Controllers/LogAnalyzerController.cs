using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class LogAnalyzerController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<LogAnalyzerController> _logger;
        private readonly ILogService _logService;
        private readonly IImageService _imageService; 
        private readonly IFullImageCache _fullImageCache;

        public LogAnalyzerController(
            LensAssemblyDbContext context, 
            ILogger<LogAnalyzerController> logger, 
            ILogService logService,
            IImageService imageService,
            IFullImageCache fullImageCache) 
        {
            _context = context;
            _logger = logger;
            _logService = logService;
            _imageService = imageService;
            _fullImageCache = fullImageCache;
        }

        /// <summary>
        /// Gets the log directory structure for a specific Machine Controller.
        /// </summary>
        [HttpGet("structure/{MCId}")]
        [Produces("application/json")]
        [ProducesResponseType(typeof(LogStructureResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<LogStructureResponse>> GetLogStructure(int MCId)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs
                    .Include(m => m.LogStructure)
                    .FirstOrDefaultAsync(m => m.MCId == MCId);

                if (mc == null) return NotFound(new ErrorOnlyResponse { Error = "MC not found" });

                string rawJson = string.IsNullOrEmpty(mc.LogStructure?.LogStructureJson) ? "[]" : mc.LogStructure.LogStructureJson;
                var files = JsonConvert.DeserializeObject(rawJson);

                return Ok(new LogStructureResponse
                {
                    MCId = MCId,
                    RootPath = mc.LogFolderPath,
                    Files = files
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetLogStructure failed for MC {MCId}", MCId);
                return StatusCode(500, new ErrorOnlyResponse { Error = ex.Message });
            }
        }

        /// <summary>
        /// Fetches NG (No Good) inspection images from the MC.
        /// </summary>
        [HttpPost("images/{MCId}")]
        [ProducesResponseType(typeof(InspectionImagesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status408RequestTimeout)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<InspectionImagesResponse>> GetInspectionImages(int MCId, [FromBody] InspectionImageRequest request)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs.FindAsync(MCId);
                if (mc == null)
                    return NotFound(new ErrorResponse { Message = "MC not found", ErrorCode = "mc_not_found" });

                var result = await _imageService.GetInspectionImagesAsync(
                    MCId,
                    request.NgPath);

                if (!result.Success)
                    return StatusCode(StatusCodes.Status408RequestTimeout, new ErrorResponse
                    {
                        Message = result.ErrorMessage ?? "Agent did not return images in time.",
                        ErrorCode = "inspection_images_timeout"
                    });

                return Ok(new InspectionImagesResponse
                {
                    Images = result.Images.Select((img, index) => new InspectionImageDto
                    {
                        Url = $"/api/LogAnalyzer/image-content/{result.RequestId}/{index}",
                        Filename = img.Filename
                    }).ToList(),
                    Count = result.Count,
                    OperationName = result.OperationName
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetInspectionImages failed for MC {MCId}", MCId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "inspection_images_failed"
                });
            }
        }

        /// <summary>
        /// Gets the binary content of a specific inspection image.
        /// </summary>
        [HttpGet("image-content/{requestId}/{index}")]
        [Produces("image/bmp", "application/json")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public ActionResult GetImageContent(string requestId, int index)
        {
            _logger.LogInformation("Fetch Image Content: Req={RequestId}, Idx={Index}", requestId, index);
            var image = _imageService.GetImageByIndex(requestId, index);
            if (image == null) 
            {
                _logger.LogWarning("Image Content NOT FOUND: Req={RequestId}, Idx={Index}", requestId, index);
                return NotFound();
            }

            return File(image.Data, "image/bmp", image.Filename);
        }

        /// <summary>
        /// Fetches a single image by its path directly from the MC.
        /// </summary>
        [HttpGet("fetch-image/{MCId}")]
        [Produces("image/bmp", "text/plain")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult> FetchSingleImage(int MCId, [FromQuery] string path)
        {
            if (string.IsNullOrEmpty(path)) return BadRequest("Path is required");

            try
            {
                
                string cacheKey = $"full_{MCId}_{path}";
                var cached = _fullImageCache.GetImage(cacheKey);
                if (cached != null)
                {
                    _logger.LogInformation("Serving full image from LRU cache: {Key}", cacheKey);
                    return File(cached.Data, cached.ContentType, cached.Filename);
                }

                var image = await _imageService.GetSingleImageAsync(MCId, path);
                if (image == null) return NotFound();

                _fullImageCache.SetImage(cacheKey, new CachedImage
                {
                    Data = image.Data,
                    Filename = image.Filename,
                    ContentType = "image/bmp", 
                    CachedAt = DateTime.UtcNow
                });

                return File(image.Data, "image/bmp", image.Filename);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FetchSingleImage failed");
                return StatusCode(500);
            }
        }

        /// <summary>
        /// Reads the text content of a specific log file on the MC.
        /// </summary>
        [HttpPost("file/{MCId}")]
        [ProducesResponseType(typeof(LogFileContentResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status408RequestTimeout)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<LogFileContentResponse>> GetLogFileContent(int MCId, [FromBody] LogFileRequest request)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs.FindAsync(MCId);
                if (mc == null)
                    return NotFound(new ErrorResponse { Message = "MC not found", ErrorCode = "mc_not_found" });

                var result = await _logService.GetLogContentAsync(MCId, request.FilePath);

                if (!result.Success)
                    return StatusCode(StatusCodes.Status408RequestTimeout, new ErrorResponse
                    {
                        Message = result.ErrorMessage ?? "Agent did not return log content in time.",
                        ErrorCode = "log_file_timeout"
                    });

                return Ok(new LogFileContentResponse
                {
                    FileName = result.FileName,
                    FilePath = result.FilePath,
                    Content = result.Content,
                    Size = result.OriginalSize,
                    Encoding = "UTF-8"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetLogFileContent failed for MC {MCId}", MCId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "log_file_content_failed"
                });
            }
        }
    }

    public class LogFileRequest
    {
        public string FilePath { get; set; } = "";
    }
}

