using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// LEGACY: Original monolithic agent API controller.
    /// 
    /// These endpoints are being migrated to thin, focused controllers:
    /// - /register → AgentRegistrationController
    /// - /heartbeat → HeartbeatController  
    /// - /updateconfig, /getconfigupdate → ConfigController
    /// - /synclogs → LogController
    /// - /syncmodels → ModelController
    /// 
    /// Endpoints marked [Obsolete] have been fully migrated.
    /// </summary>
    [Route("api/agent-legacy")]
    [ApiController]
    public class AgentApiController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<AgentApiController> _logger;
        private readonly LogRequestManager _requestManager;
        private readonly IImageService _imageService;

        public AgentApiController(
            FactoryDbContext context, 
            ILogger<AgentApiController> logger, 
            LogRequestManager requestManager,
            IImageService imageService)
        {
            _context = context;
            _logger = logger;
            _requestManager = requestManager;
            _imageService = imageService;
        }

        [Obsolete("Use AgentRegistrationController.Register instead. This endpoint will be removed in a future release.")]
        [HttpPost("register")]  
        public async Task<ActionResult<AgentRegistrationResponse>> Register([FromBody] AgentRegistrationRequest request)
        {
            // ModelState is automatically validated due to [ApiController] attribute based on DTO annotations
            try
            {
                var existingPC = await _context.FactoryPCs
                    .FirstOrDefaultAsync(p => p.LineNumber == request.LineNumber
                                            && p.PCNumber == request.PCNumber
                                            && p.ModelVersion == request.ModelVersion);

                int pcId;

                if (existingPC == null)
                {
                    var newPC = new FactoryPC
                    {
                        LineNumber = request.LineNumber,
                        PCNumber = request.PCNumber,
                        IPAddress = request.IPAddress,
                        ConfigFilePath = request.ConfigFilePath,
                        LogFolderPath = request.LogFolderPath,
                        ModelFolderPath = request.ModelFolderPath,
                        ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion) ? "3.5" : request.ModelVersion,
                        IsOnline = true,
                        LastHeartbeat = DateTime.Now,
                        LogStructureJson = request.LogStructureJson
                    };

                    _context.FactoryPCs.Add(newPC);
                    await _context.SaveChangesAsync();
                    pcId = newPC.PCId;

                    _logger.LogInformation($"New PC registered: Line {request.LineNumber}, PC {request.PCNumber}, Version {request.ModelVersion}");
                }
                else
                {
                    existingPC.IPAddress = request.IPAddress;
                    existingPC.ConfigFilePath = request.ConfigFilePath;
                    existingPC.LogFolderPath = request.LogFolderPath;
                    existingPC.ModelFolderPath = request.ModelFolderPath;
                    existingPC.ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion)
                        ? existingPC.ModelVersion
                        : request.ModelVersion;
                    existingPC.IsOnline = true;
                    existingPC.LastHeartbeat = DateTime.Now;
                    existingPC.LastUpdated = DateTime.Now;

                    if (!string.IsNullOrEmpty(request.LogStructureJson))
                    {
                        existingPC.LogStructureJson = request.LogStructureJson;
                    }

                    await _context.SaveChangesAsync();
                    pcId = existingPC.PCId;

                    _logger.LogInformation($"PC re-registered: Line {request.LineNumber}, PC {request.PCNumber}, Version {request.ModelVersion}");
                }

                return Ok(new AgentRegistrationResponse
                {
                    Success = true,
                    PCId = pcId,
                    Message = "Registration successful"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during agent registration");
                return StatusCode(500, new AgentRegistrationResponse
                {
                    Success = false,
                    Message = $"Registration failed: {ex.Message}"
                });
            }
        }

        [Obsolete("Use HeartbeatController.Heartbeat instead. This endpoint will be removed in a future release.")]
        [HttpPost("heartbeat")]
        public async Task<ActionResult<HeartbeatResponse>> Heartbeat([FromBody] HeartbeatRequest request)
        {
            try
            {
                var pc = await _context.FactoryPCs.FindAsync(request.PCId);
                if (pc == null)
                {
                    // ORPHAN HANDLING:
                    // If the PC is not found (deleted from DB), tell the Agent to self-destruct (Reset).
                    // This allows "Immediate Hard Delete" on server while ensuring Agent cleans up.
                    
                    var resetCommand = new CommandInfo
                    {
                        CommandId = 0, // Virtual ID
                        CommandType = "ResetAgent",
                        CommandData = "Orphaned PC - Auto Reset"
                    };

                    return Ok(new HeartbeatResponse 
                    { 
                        Success = true, 
                        HasPendingCommands = true,
                        Commands = new List<CommandInfo> { resetCommand }
                    });
                }

                pc.LastHeartbeat = DateTime.Now;
                pc.IsOnline = true;
                pc.IsApplicationRunning = request.IsApplicationRunning;
                pc.LastUpdated = DateTime.Now;

                var pendingCommands = await _context.AgentCommands
                    .Where(c => c.PCId == request.PCId 
                        && c.Status == "Pending"
                        && c.CommandType != "GetLogFileContent") // Exclude: handled via WebSocket
                    .OrderBy(c => c.CreatedDate)
                    .ToListAsync();

                var commands = pendingCommands.Select(c => new CommandInfo
                {
                    CommandId = c.CommandId,
                    CommandType = c.CommandType,
                    CommandData = c.CommandData
                }).ToList();

                foreach (var cmd in pendingCommands)
                {
                    cmd.Status = "InProgress";
                    cmd.ExecutedDate = DateTime.Now;
                }

                await _context.SaveChangesAsync();

                return Ok(new HeartbeatResponse
                {
                    Success = true,
                    HasPendingCommands = commands.Count > 0,
                    Commands = commands
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during heartbeat");
                return StatusCode(500, new HeartbeatResponse { Success = false });
            }
        }

        [Obsolete("Use ConfigController.UpdateConfig instead. This endpoint will be removed in a future release.")]
        [HttpPost("updateconfig")]
        public async Task<ActionResult<ApiResponse>> UpdateConfig([FromBody] ConfigUpdateRequest request)
        {
            try
            {
                var existingConfig = await _context.ConfigFiles
                    .FirstOrDefaultAsync(c => c.PCId == request.PCId);

                if (existingConfig == null)
                {
                    var newConfig = new ConfigFile
                    {
                        PCId = request.PCId,
                        ConfigContent = request.ConfigContent,
                        LastModified = DateTime.Now
                    };
                    _context.ConfigFiles.Add(newConfig);
                }
                else
                {
                    existingConfig.ConfigContent = request.ConfigContent;
                    existingConfig.LastModified = DateTime.Now;

                    if (existingConfig.PendingUpdate)
                    {
                        existingConfig.UpdateApplied = true;
                        existingConfig.PendingUpdate = false;
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Config updated successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating config");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Config update failed: {ex.Message}"
                });
            }
        }

        [Obsolete("Use LogController.SyncLogStructure instead. This endpoint will be removed in a future release.")]
        [HttpPost("synclogs")]
        public async Task<ActionResult<ApiResponse>> SyncLogStructure([FromBody] LogStructureSyncRequest request)
        {
            try
            {
                // TIMING LOG: Track when each sync arrives to verify spread mechanism
                _logger.LogInformation($"[SYNC TIMING] PC={request.PCId} arrived at {DateTime.Now:HH:mm:ss.fff}");
                
                var pc = await _context.FactoryPCs.FindAsync(request.PCId);
                if (pc == null) return NotFound(new ApiResponse { Success = false, Message = "PC not found" });

                pc.LogStructureJson = request.LogStructureJson;
                pc.LastUpdated = DateTime.Now;

                await _context.SaveChangesAsync();
                
                _logger.LogInformation($"[SYNC TIMING] PC={request.PCId} saved at {DateTime.Now:HH:mm:ss.fff}");
                
                return Ok(new ApiResponse { Success = true, Message = "Log structure synced" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing log structure");
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }


        [Obsolete("Use ModelController.SyncModels instead. This endpoint will be removed in a future release.")]
        [HttpPost("syncmodels")]
        public async Task<ActionResult<ApiResponse>> SyncModels([FromBody] ModelSyncRequest request)
        {
            try
            {
                var existingModels = await _context.Models
                    .Where(m => m.PCId == request.PCId)
                    .ToListAsync();

                foreach (var modelInfo in request.Models)
                {
                    var existingModel = existingModels
                        .FirstOrDefault(m => m.ModelName == modelInfo.ModelName);

                    if (existingModel == null)
                    {
                        var newModel = new Model
                        {
                            PCId = request.PCId,
                            ModelName = modelInfo.ModelName,
                            ModelPath = modelInfo.ModelPath,
                            IsCurrentModel = modelInfo.IsCurrent,
                            LastUsed = modelInfo.IsCurrent ? DateTime.Now : null
                        };
                        _context.Models.Add(newModel);
                    }
                    else
                    {
                        bool wasCurrent = existingModel.IsCurrentModel;

                        existingModel.ModelPath = modelInfo.ModelPath;
                        existingModel.IsCurrentModel = modelInfo.IsCurrent;

                        if (modelInfo.IsCurrent && !wasCurrent)
                        {
                            existingModel.LastUsed = DateTime.Now;
                        }
                    }
                }

                var modelNamesFromRequest = request.Models.Select(m => m.ModelName).ToList();
                var modelsToRemove = existingModels
                    .Where(m => !modelNamesFromRequest.Contains(m.ModelName))
                    .ToList();

                _context.Models.RemoveRange(modelsToRemove);

                await _context.SaveChangesAsync();

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Models synced successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing models");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Model sync failed: {ex.Message}"
                });
            }
        }

        [Obsolete("Use CommandController.CommandResult instead. This endpoint will be removed in a future release.")]
        [HttpPost("commandresult")]
        public async Task<ActionResult<ApiResponse>> CommandResult([FromBody] CommandResultRequest request)
        {
            try
            {
                var command = await _context.AgentCommands.FindAsync(request.CommandId);
                if (command == null)
                {
                    return NotFound(new ApiResponse { Success = false, Message = "Command not found" });
                }

                command.Status = request.Status;
                command.ResultData = request.ResultData;
                command.ErrorMessage = request.ErrorMessage;
                command.ExecutedDate = DateTime.Now;

                if (command.CommandType == "ResetAgent" && request.Status == "Completed")
                {
                    var pc = await _context.FactoryPCs
                        .Include(p => p.ConfigFile)
                        .Include(p => p.Models)
                        .FirstOrDefaultAsync(p => p.PCId == command.PCId);

                    if (pc != null)
                    {
                        _context.FactoryPCs.Remove(pc);
                        _logger.LogInformation($"PC {pc.PCId} permanently deleted after Agent confirmation.");
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Command result recorded"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recording command result");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Command result failed: {ex.Message}"
                });
            }
        }

        [Obsolete("Use ConfigController.GetConfigUpdate instead. This endpoint will be removed in a future release.")]
        [HttpGet("getconfigupdate/{pcId}")]
        public async Task<ActionResult<ApiResponse>> GetConfigUpdate(int pcId)
        {
            try
            {
                var config = await _context.ConfigFiles
                    .FirstOrDefaultAsync(c => c.PCId == pcId && c.PendingUpdate);

                if (config == null)
                {
                    return Ok(new ApiResponse
                    {
                        Success = true,
                        Message = "No pending update",
                        Data = null
                    });
                }

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Config update available",
                    Data = new
                    {
                        config.UpdatedContent,
                        config.UpdateRequestTime
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting config update");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Get config update failed: {ex.Message}"
                });
            }
        }

        // NEW: Endpoint for agent to upload model files back to server
        [HttpPost("uploadmodelfile")]
        public async Task<ActionResult<ApiResponse>> UploadModelFile([FromForm] IFormFile file, [FromForm] string modelName)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "No file uploaded" });
                }

                // --- SECURITY VALIDATION ---
                // 1. Size Limit (e.g. 500 MB)
                if (file.Length > 500 * 1024 * 1024)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "File size exceeds limit of 500MB" });
                }

                // 2. Extension Whitelist
                var allowedExtensions = new[] { ".zip", ".json", ".xml", ".config" };
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!allowedExtensions.Contains(ext))
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "Invalid file type. Allowed: .zip, .json, .xml, .config" });
                }
                // ---------------------------

                using var memoryStream = new MemoryStream();
                await file.CopyToAsync(memoryStream);

                var modelFile = new ModelFile
                {
                    ModelName = modelName,
                    FileName = file.FileName,
                    FileData = memoryStream.ToArray(),
                    FileSize = file.Length,
                    UploadedDate = DateTime.Now,
                    IsActive = true
                };

                _context.ModelFiles.Add(modelFile);
                await _context.SaveChangesAsync();

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Model file uploaded successfully",
                    Data = new { ModelFileId = modelFile.ModelFileId }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading model file from agent");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Model upload failed: {ex.Message}"
                });
            }
        }

        [HttpPost("uploadmodel")]
        public async Task<ActionResult<ApiResponse>> UploadModel([FromForm] IFormFile file, [FromForm] string modelName, [FromForm] int pcId)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "No file uploaded" });
                }

                // Same validation here if desired
                if (file.Length > 500 * 1024 * 1024)
                    return BadRequest(new ApiResponse { Success = false, Message = "File too large" });

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (ext != ".zip")
                    return BadRequest(new ApiResponse { Success = false, Message = "Only .zip files allowed for Model Upload" });


                using var memoryStream = new MemoryStream();
                await file.CopyToAsync(memoryStream);

                var modelFile = new ModelFile
                {
                    ModelName = modelName,
                    FileName = file.FileName,
                    FileData = memoryStream.ToArray(),
                    FileSize = file.Length,
                    UploadedDate = DateTime.Now
                };

                _context.ModelFiles.Add(modelFile);
                await _context.SaveChangesAsync();

                var downloadUrl = $"/api/agent-legacy/downloadmodel/{modelFile.ModelFileId}";

                // Deduplication
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.PCId == pcId && c.Status == "Pending" && c.CommandType == "UploadModel")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                var command = new AgentCommand
                {
                    PCId = pcId,
                    CommandType = "UploadModel",
                    CommandData = JsonConvert.SerializeObject(new
                    {
                        ModelFileId = modelFile.ModelFileId,
                        ModelName = modelName,
                        FileName = file.FileName,
                        DownloadUrl = downloadUrl
                    }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Model uploaded successfully",
                    Data = new { ModelFileId = modelFile.ModelFileId }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading model");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = $"Model upload failed: {ex.Message}"
                });
            }
        }

        [HttpGet("downloadmodel/{modelFileId}")]
        public async Task<IActionResult> DownloadModel(int modelFileId)
        {
            try
            {
                var modelFile = await _context.ModelFiles.FindAsync(modelFileId);
                if (modelFile == null)
                {
                    return NotFound();
                }

                return File(modelFile.FileData, "application/octet-stream", modelFile.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading model");
                return StatusCode(500);
            }
        }

        /// <summary>
        /// Receive log file from Agent. Supports both compressed and uncompressed.
        /// If uncompressed, compresses it before caching.
        /// </summary>
        [HttpPost("uploadlog/{requestId}")]
        public async Task<IActionResult> UploadLogWithRequestId(string requestId, [FromForm] string modelName, IFormFile file)
        {
            if (!int.TryParse(modelName, out int pcId) || file == null || file.Length == 0)
            {
                return BadRequest($"Invalid PC ID '{modelName}' or Empty File");
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

                if (_requestManager.CompleteRequest(requestId, compressedContent))
                {
                    return Ok(new { message = "Log received.", compressed = isGzipCompressed, size = compressedBytes.Length });
                }
                else
                {
                    _logger.LogWarning($"Request {requestId} not found or expired for PC {pcId}");
                    return Ok(new { message = "Log received (request not found)." });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing log upload for PC {pcId}");
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Legacy endpoint for backward compatibility (no requestId).
        /// </summary>
        [HttpPost("uploadlog")]
        public async Task<IActionResult> UploadLog([FromForm] string modelName, IFormFile file)
        {
            if (!int.TryParse(modelName, out int pcId) || file == null || file.Length == 0)
            {
                return BadRequest($"Invalid PC ID '{modelName}' or Empty File");
            }

            try
            {
                // Find the active log request command (legacy flow)
                var pendingCmd = await _context.AgentCommands
                    .Where(c => c.PCId == pcId
                             && c.CommandType == "GetLogFileContent"
                             && (c.Status == "Pending" || c.Status == "InProgress"))
                    .OrderByDescending(c => c.CreatedDate)
                    .FirstOrDefaultAsync();

                if (pendingCmd == null)
                {
                    return NotFound($"No active log request found for PC {pcId}.");
                }

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

                return Ok(new { message = "Log received and command updated." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing log upload for PC {pcId}");
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Agent uploads inspection images for NG operations.
        /// Images should be GZIP compressed BMP files encoded as base64.
        /// </summary>
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

                // Convert Base64 validation to byte array (Legacy support if needed, or remove)
                // For now, assuming this endpoint might still be called by old agents
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

        /// <summary>
        /// Agent uploads inspection images as binary (Multipart).
        /// </summary>
        [HttpPost("upload-image-binary/{requestId}")]
        public async Task<IActionResult> UploadInspectionImagesBinary(string requestId)
        {
            try
            {
                // If Content-Type is not multipart (e.g. empty POST from agent for "Not Found"), handle graceful 0
                if (!Request.HasFormContentType)
                {
                    _logger.LogWarning("Agent returned non-multipart response (likely 0 images found) for Req {RequestId}", requestId);
                    _imageService.CompleteImageRequest(requestId, new List<ImageData>());
                    return Ok(new { message = "No images found", count = 0 });
                }

                if (Request.Form.Files.Count == 0)
                {
                     // Multipart but empty
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
    }

    /// <summary>
    /// Request model for image upload from agent.
    /// </summary>
    public class ImageUploadRequest
    {
        public List<ImageUploadItem> Images { get; set; } = new();
    }

    public class ImageUploadItem
    {
        /// <summary>
        /// Base64 encoded GZIP compressed BMP data.
        /// </summary>
        public string Data { get; set; } = "";
        
        /// <summary>
        /// Original filename.
        /// </summary>
        public string Filename { get; set; } = "";
    }
}
