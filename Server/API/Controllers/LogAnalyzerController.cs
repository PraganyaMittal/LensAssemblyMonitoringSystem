using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
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

        [HttpGet("structure/{MCId}")]
        public async Task<ActionResult<object>> GetLogStructure(int MCId)
        {
            var mc = await _context.LensAssemblyMCs.FindAsync(MCId);
            if (mc == null) return NotFound(new { error = "MC not found" });

            string rawJson = string.IsNullOrEmpty(mc.LogStructureJson) ? "[]" : mc.LogStructureJson;

            string responseJson = $@"{{
                ""MCId"": {MCId},
                ""rootPath"": {JsonConvert.ToString(mc.LogFolderPath)}, 
                ""files"": {rawJson}
            }}";

            return Content(responseJson, "application/json");
        }

        [HttpPost("images/{MCId}")]
        public async Task<ActionResult<object>> GetInspectionImages(int MCId, [FromBody] InspectionImageRequest request)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs.FindAsync(MCId);
                if (mc == null)
                    return NotFound(new { error = "MC not found" });

                var result = await _imageService.GetInspectionImagesAsync(
                    MCId,
                    request.ImagePath,
                    request.ModelName,
                    request.TrayId,
                    request.BarrelId,
                    request.InspectionName);

                if (!result.Success)
                    return StatusCode(408, new { error = result.ErrorMessage });

                return Ok(new
                {
                    images = result.Images.Select((img, index) => new
                    {
                        url = $"/api/LogAnalyzer/image-content/{result.RequestId}/{index}",
                        filename = img.Filename
                    }).ToList(),
                    count = result.Count,
                    operationName = result.OperationName
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetInspectionImages failed for MC {MCId}", MCId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("image-content/{requestId}/{index}")]
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

        [HttpGet("fetch-image/{MCId}")]
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

        [HttpPost("file/{MCId}")]
        public async Task<ActionResult<object>> GetLogFileContent(int MCId, [FromBody] LogFileRequest request)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs.FindAsync(MCId);
                if (mc == null)
                    return NotFound(new { error = "MC not found" });

                var result = await _logService.GetLogContentAsync(MCId, request.FilePath);

                if (!result.Success)
                    return StatusCode(408, new { error = result.ErrorMessage });

                return Ok(new
                {
                    fileName = result.FileName,
                    filePath = result.FilePath,
                    content = result.Content,
                    size = result.OriginalSize,
                    encoding = "UTF-8"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetLogFileContent failed for MC {MCId}", MCId);
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class LogFileRequest
    {
        public string FilePath { get; set; } = "";
    }
}

