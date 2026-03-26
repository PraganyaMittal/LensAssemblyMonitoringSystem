using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ThumbnailController : ControllerBase
    {
        private readonly IThumbnailCache _thumbnailCache;
        private readonly IImageService _imageService;
        private readonly ILogger<ThumbnailController> _logger;

        public ThumbnailController(
            IThumbnailCache thumbnailCache,
            IImageService imageService,
            ILogger<ThumbnailController> logger)
        {
            _thumbnailCache = thumbnailCache;
            _imageService = imageService;
            _logger = logger;
        }

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

            return Ok(new { 
                message = "Thumbnails cached", 
                count = request.Thumbnails.Count,
                logFileName = request.LogFileName
            });
        }

        [HttpPost("upload-binary/{requestId}")]
        public async Task<IActionResult> UploadInspectionImagesBinary(string requestId)
        {
            try
            {
                
                if (!Request.HasFormContentType)
                {
                    _logger.LogWarning("Agent returned non-multipart response (likely 0 images found) for Req {RequestId}", requestId);
                    _imageService.CompleteImageRequest(requestId, new List<ImageData>());
                    return Ok(new { message = "No images found", count = 0 });
                }

                if (Request.Form.Files.Count == 0)
                {
                     
                    _imageService.CompleteImageRequest(requestId, new List<ImageData>());
                    return Ok(new { message = "No images found", count = 0 });
                }

                var files = Request.Form.Files;
                _logger.LogInformation(
                    "Received {Count} binary images for request {RequestId}",
                    files.Count, requestId);

                var imageDataList = new List<ImageData>();

                foreach (var file in files)
                {
                    if (file.Length > 0)
                    {
                        using var ms = new MemoryStream();
                        await file.CopyToAsync(ms);
                        
                        imageDataList.Add(new ImageData
                        {
                            Data = ms.ToArray(),
                            Filename = file.FileName
                        });
                    }
                }

                _imageService.CompleteImageRequest(requestId, imageDataList);

                return Ok(new
                {
                    message = "Images received",
                    count = files.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing binary image upload for request {RequestId}", requestId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("uploadimage/{requestId}")]
        public IActionResult UploadInspectionImages(string requestId, [FromBody] ImageUploadRequest request)
        {
            try
            {
                if (request?.Images == null || request.Images.Count == 0)
                {
                    return BadRequest(new { error = "No images provided" });
                }

                _logger.LogInformation(
                    "Received {Count} images for request {RequestId}",
                    request.Images.Count, requestId);

                var imageDataList = request.Images.Select(img => new ImageData
                {
                    Data = Convert.FromBase64String(img.Data),
                    Filename = img.Filename
                }).ToList();

                _imageService.CompleteImageRequest(requestId, imageDataList);

                return Ok(new { 
                    message = "Images received", 
                    count = request.Images.Count 
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing image upload for request {RequestId}", requestId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

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

        [HttpGet("{logFileName}/operation/{operationName}")]
        public IActionResult GetThumbnailsForOperation(string logFileName, string operationName, [FromQuery] string? barrelId = null)
        {
            var thumbnails = _thumbnailCache.GetThumbnailsForOperation(logFileName, operationName, barrelId);
            
            if (thumbnails == null || thumbnails.Count == 0)
            {
                return NotFound(new { error = "No thumbnails found for this operation" });
            }

            return Ok(new
            {
                logFileName,
                operationName,
                barrelId,
                thumbnails = thumbnails.Select(t => new
                {
                    filename = t.Filename,
                    imagePath = t.ImagePath,
                    data = t.Data
                }).ToList(),
                count = thumbnails.Count
            });
        }

        [HttpGet("{logFileName}/available")]
        public IActionResult CheckAvailability(string logFileName)
        {
            var available = _thumbnailCache.HasThumbnails(logFileName);
            return Ok(new { logFileName, available });
        }
    }

    public class ImageUploadRequest
    {
        public List<ImageUploadItem> Images { get; set; } = new();
    }

    public class ImageUploadItem
    {

        public string Data { get; set; } = "";

        public string Filename { get; set; } = "";
    }
}

