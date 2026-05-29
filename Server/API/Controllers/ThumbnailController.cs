using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Models.DTOs;
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

        /// <summary>
        /// Receives base64-encoded thumbnail images from an agent.
        /// </summary>
        [HttpPost("upload")]
        [ProducesResponseType(typeof(ThumbnailUploadResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status400BadRequest)]
        public ActionResult<ThumbnailUploadResponse> UploadThumbnails([FromBody] ThumbnailUploadRequest request)
        {
            if (string.IsNullOrEmpty(request.LogFileName) || request.Thumbnails == null)
            {
                return BadRequest(new ErrorOnlyResponse { Error = "Invalid request" });
            }

            _logger.LogInformation("Received {Count} thumbnails for log {LogFileName}",
                request.Thumbnails.Count, request.LogFileName);

            _thumbnailCache.SetThumbnails(request.LogFileName, request.Thumbnails);

            return Ok(new ThumbnailUploadResponse
            {
                Message = "Thumbnails cached",
                Count = request.Thumbnails.Count,
                LogFileName = request.LogFileName
            });
        }

        /// <summary>
        /// Receives binary image uploads for a specific inspection request.
        /// </summary>
        [HttpPost("upload-binary/{requestId}")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType(typeof(ThumbnailUploadResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ThumbnailUploadResponse>> UploadInspectionImagesBinary(string requestId)
        {
            try
            {
                
                if (!Request.HasFormContentType)
                {
                    _logger.LogWarning("Agent returned non-multipart response (likely 0 images found) for Req {RequestId}", requestId);
                    _imageService.CompleteImageRequest(requestId, new List<ImageData>());
                    return Ok(new ThumbnailUploadResponse { Message = "No images found", Count = 0 });
                }

                if (Request.Form.Files.Count == 0)
                {
                     
                    _imageService.CompleteImageRequest(requestId, new List<ImageData>());
                    return Ok(new ThumbnailUploadResponse { Message = "No images found", Count = 0 });
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

                return Ok(new ThumbnailUploadResponse
                {
                    Message = "Images received",
                    Count = files.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing binary image upload for request {RequestId}", requestId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorOnlyResponse { Error = ex.Message });
            }
        }

        /// <summary>
        /// Retrieves all cached thumbnails for a specific log file.
        /// </summary>
        [HttpGet("{logFileName}")]
        [ProducesResponseType(typeof(ThumbnailResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status404NotFound)]
        public ActionResult<ThumbnailResponse> GetThumbnails(string logFileName)
        {
            var thumbnails = _thumbnailCache.GetThumbnails(logFileName);
            
            if (thumbnails == null)
            {
                return NotFound(new ErrorOnlyResponse { Error = "Thumbnails not cached for this log file" });
            }

            return Ok(new ThumbnailResponse
            {
                LogFileName = logFileName,
                Thumbnails = thumbnails.Select(t => new ThumbnailDto
                {
                    OperationName = t.OperationName,
                    NgPath = t.NgPath,
                    Filename = t.Filename,
                    Data = t.Data
                }).ToList(),
                Count = thumbnails.Count
            });
        }

        /// <summary>
        /// Retrieves thumbnails for a specific operation within a log file.
        /// </summary>
        [HttpGet("{logFileName}/operation/{operationName}")]
        [ProducesResponseType(typeof(ThumbnailResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status404NotFound)]
        public ActionResult<ThumbnailResponse> GetThumbnailsForOperation(string logFileName, string operationName, [FromQuery] string? barrelId = null, [FromQuery] string? barrelTrayId = null)
        {
            var thumbnails = _thumbnailCache.GetThumbnailsForOperation(logFileName, operationName, barrelId, barrelTrayId);
            
            if (thumbnails == null || thumbnails.Count == 0)
            {
                return NotFound(new ErrorOnlyResponse { Error = "No thumbnails found for this operation" });
            }

            return Ok(new ThumbnailResponse
            {
                LogFileName = logFileName,
                OperationName = operationName,
                BarrelId = barrelId,
                Thumbnails = thumbnails.Select(t => new ThumbnailDto
                {
                    Filename = t.Filename,
                    NgPath = t.NgPath,
                    Data = t.Data
                }).ToList(),
                Count = thumbnails.Count
            });
        }

        /// <summary>
        /// Checks if thumbnails are available in cache for a given log file.
        /// </summary>
        [HttpGet("{logFileName}/available")]
        [ProducesResponseType(typeof(ThumbnailAvailabilityResponse), StatusCodes.Status200OK)]
        public ActionResult<ThumbnailAvailabilityResponse> CheckAvailability(string logFileName)
        {
            var available = _thumbnailCache.HasThumbnails(logFileName);
            return Ok(new ThumbnailAvailabilityResponse { LogFileName = logFileName, Available = available });
        }
    }

}

