using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    [EnableRateLimiting("agent")]
    public class AgentApiController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<AgentApiController> _logger;
        private readonly LogRequestManager _requestManager;
        private readonly IImageService _imageService;
        private readonly IModelStorageService _storage;
        private readonly IModelValidationService _validation;

        public AgentApiController(
            FactoryDbContext context, 
            ILogger<AgentApiController> logger, 
            LogRequestManager requestManager,
            IImageService imageService,
            IModelStorageService storage,
            IModelValidationService validation)
        {
            _context = context;
            _logger = logger;
            _requestManager = requestManager;
            _imageService = imageService;
            _storage = storage;
            _validation = validation;
        }

        [Obsolete("Use AgentRegistrationController.Register instead. This endpoint will be removed in a future release.")]
        [HttpPost("register")]  
        public async Task<ActionResult<AgentRegistrationResponse>> Register([FromBody] AgentRegistrationRequest request)
        {
            // ModelState is automatically validated due to [ApiController] attribute based on DTO annotations
            try
            {
                var existingPC = await _context.FactoryMCs
                    .FirstOrDefaultAsync(p => p.LineNumber == request.LineNumber
                                            && p.MCNumber == request.MCNumber
                                            && p.ModelVersion == request.ModelVersion);

                int MCId;

                if (existingPC == null)
                {
                    var newPC = new FactoryMC
                    {
                        LineNumber = request.LineNumber,
                        MCNumber = request.MCNumber,
                        IPAddress = request.IPAddress,
                        ConfigFilePath = request.ConfigFilePath,
                        LogFolderPath = request.LogFolderPath,
                        ModelFolderPath = request.ModelFolderPath,
                        ModelVersion = string.IsNullOrWhiteSpace(request.ModelVersion) ? "3.5" : request.ModelVersion,
                        IsOnline = true,
                        LastHeartbeat = DateTime.Now,
                        LogStructureJson = request.LogStructureJson
                    };

                    _context.FactoryMCs.Add(newPC);
                    await _context.SaveChangesAsync();
                    MCId = newPC.MCId;

                    _logger.LogInformation($"New PC registered: Line {request.LineNumber}, PC {request.MCNumber}, Version {request.ModelVersion}");
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
                    MCId = existingPC.MCId;

                    _logger.LogInformation($"PC re-registered: Line {request.LineNumber}, PC {request.MCNumber}, Version {request.ModelVersion}");
                }

                // If agent provided full model list at registration, sync all to DB immediately
                if (request.Models != null && request.Models.Count > 0)
                {
                    var existingModels = await _context.Models.Where(m => m.MCId == MCId).ToListAsync();
                    var modelNames = request.Models.Select(m => m.ModelName).ToHashSet();

                    // Insert or update each model from registration
                    foreach (var modelInfo in request.Models)
                    {
                        var existing = existingModels.FirstOrDefault(m => m.ModelName == modelInfo.ModelName);
                        if (existing == null)
                        {
                            _context.Models.Add(new Model
                            {
                                MCId = MCId,
                                ModelName = modelInfo.ModelName,
                                ModelPath = modelInfo.ModelPath,
                                IsCurrentModel = modelInfo.IsCurrent,
                                LastUsed = modelInfo.IsCurrent ? DateTime.Now : null
                            });
                        }
                        else
                        {
                            existing.ModelPath = modelInfo.ModelPath;
                            existing.IsCurrentModel = modelInfo.IsCurrent;
                            if (modelInfo.IsCurrent) existing.LastUsed = DateTime.Now;
                        }
                    }

                    // Remove models not present on agent anymore
                    var staleModels = existingModels.Where(m => !modelNames.Contains(m.ModelName)).ToList();
                    if (staleModels.Any()) _context.Models.RemoveRange(staleModels);

                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Registration sync: {Count} models for MC {MCId}", request.Models.Count, MCId);
                }
                else if (!string.IsNullOrWhiteSpace(request.CurrentModelName))
                {
                    // Fallback: only current model name provided (no full list)
                    var existingModels = await _context.Models.Where(m => m.MCId == MCId).ToListAsync();
                    foreach (var m in existingModels) m.IsCurrentModel = false;

                    var existingModel = existingModels.FirstOrDefault(m => m.ModelName == request.CurrentModelName);
                    if (existingModel == null)
                    {
                        _context.Models.Add(new Model
                        {
                            MCId = MCId,
                            ModelName = request.CurrentModelName,
                            ModelPath = request.CurrentModelPath ?? string.Empty,
                            IsCurrentModel = true,
                            LastUsed = DateTime.Now
                        });
                    }
                    else
                    {
                        existingModel.IsCurrentModel = true;
                        existingModel.LastUsed = DateTime.Now;
                    }
                    await _context.SaveChangesAsync();
                }

                return Ok(new AgentRegistrationResponse
                {
                    Success = true,
                    MCId = MCId,
                    LineNumber = request.LineNumber,
                    MCNumber = request.MCNumber,
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
                var pc = await _context.FactoryMCs.FindAsync(request.MCId);
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
                    .Where(c => c.MCId == request.MCId 
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

        [HttpPost("uploadconfig")]
        [Consumes("application/json")]
        public ActionResult<ApiResponse> UploadConfig([FromBody] ConfigUploadRequest request, [FromServices] IConfigService configService)
        {
            if (string.IsNullOrEmpty(request.RequestId) || string.IsNullOrEmpty(request.ConfigContent))
            {
                return BadRequest(new ApiResponse { Success = false, Message = "RequestId and ConfigContent required." });
            }

            var completed = configService.CompleteConfigRequest(request.RequestId, request.ConfigContent);

            return Ok(new ApiResponse
            {
                Success = completed,
                Message = completed ? "Config received" : "Request not found or expired"
            });
        }

        [Obsolete("Use LogController.SyncLogStructure instead. This endpoint will be removed in a future release.")]
        [HttpPost("synclogs")]
        public async Task<ActionResult<ApiResponse>> SyncLogStructure([FromBody] LogStructureSyncRequest request)
        {
            try
            {
                // TIMING LOG: Track when each sync arrives to verify spread mechanism
                _logger.LogInformation($"[SYNC TIMING] PC={request.MCId} arrived at {DateTime.Now:HH:mm:ss.fff}");
                
                var pc = await _context.FactoryMCs.FindAsync(request.MCId);
                if (pc == null) return NotFound(new ApiResponse { Success = false, Message = "PC not found" });

                pc.LogStructureJson = request.LogStructureJson;
                pc.LastUpdated = DateTime.Now;

                await _context.SaveChangesAsync();
                
                _logger.LogInformation($"[SYNC TIMING] PC={request.MCId} saved at {DateTime.Now:HH:mm:ss.fff}");
                
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
                    .Where(m => m.MCId == request.MCId)
                    .ToListAsync();

                foreach (var modelInfo in request.Models)
                {
                    var existingModel = existingModels
                        .FirstOrDefault(m => m.ModelName == modelInfo.ModelName);

                    if (existingModel == null)
                    {
                        var newModel = new Model
                        {
                            MCId = request.MCId,
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
                    var pc = await _context.FactoryMCs
                        .Include(p => p.Models)
                        .FirstOrDefaultAsync(p => p.MCId == command.MCId);

                    if (pc != null)
                    {
                        _context.FactoryMCs.Remove(pc);
                        _logger.LogInformation($"PC {pc.MCId} permanently deleted after Agent confirmation.");
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


        // NEW: Endpoint for agent to upload model files back to server
        [HttpPost("uploadmodelfile")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult<ApiResponse>> UploadModelFile([FromForm] IFormFile file, [FromForm] string modelName)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "No file uploaded" });
                }

                // --- SECURITY VALIDATION ---
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                var allowedExtensions = new[] { ".zip", ".json", ".xml", ".config" };
                if (!allowedExtensions.Contains(ext))
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "Invalid file type. Allowed: .zip, .json, .xml, .config" });
                }
                // ---------------------------

                // Stream to temp file instead of loading into memory
                var tempPath = Path.Combine(Path.GetTempPath(), "FactoryUploads", Guid.NewGuid() + ext);
                Directory.CreateDirectory(Path.GetDirectoryName(tempPath)!);

                try
                {
                    using (var stream = new FileStream(tempPath, FileMode.Create))
                        await file.CopyToAsync(stream);

                    // Validate if zip
                    if (ext == ".zip")
                    {
                        var validationResult = await _validation.ValidateZipAsync(tempPath);
                        if (!validationResult.IsValid)
                            return BadRequest(new ApiResponse { Success = false, Message = validationResult.ErrorMessage });
                    }

                    var checksum = await _storage.ComputeChecksumAsync(tempPath);

                    var modelFile = new ModelFile
                    {
                        ModelName = modelName,
                        FileName = file.FileName,
                        StoragePath = "",
                        FileSize = file.Length,
                        Checksum = checksum,
                        ContentHash = checksum,
                        UploadedDate = DateTime.Now,
                        IsActive = true
                    };

                    _context.ModelFiles.Add(modelFile);
                    await _context.SaveChangesAsync();

                    using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                    {
                        modelFile.StoragePath = await _storage.SaveModelAsync(fileStream, modelFile.ModelFileId, 1);
                    }
                    await _context.SaveChangesAsync();

                    return Ok(new ApiResponse
                    {
                        Success = true,
                        Message = "Model file uploaded successfully",
                        Data = new { ModelFileId = modelFile.ModelFileId }
                    });
                }
                finally
                {
                    if (System.IO.File.Exists(tempPath))
                        System.IO.File.Delete(tempPath);
                }
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
        [DisableRequestSizeLimit]
        public async Task<ActionResult<ApiResponse>> UploadModel([FromForm] IFormFile file, [FromForm] string modelName, [FromForm] int MCId)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "No file uploaded" });
                }

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (ext != ".zip")
                    return BadRequest(new ApiResponse { Success = false, Message = "Only .zip files allowed for Model Upload" });

                // Stream to temp file
                var tempPath = Path.Combine(Path.GetTempPath(), "FactoryUploads", Guid.NewGuid() + ".zip");
                Directory.CreateDirectory(Path.GetDirectoryName(tempPath)!);

                try
                {
                    using (var stream = new FileStream(tempPath, FileMode.Create))
                        await file.CopyToAsync(stream);

                    var checksum = await _storage.ComputeChecksumAsync(tempPath);

                    var modelFile = new ModelFile
                    {
                        ModelName = modelName,
                        FileName = file.FileName,
                        StoragePath = "",
                        FileSize = file.Length,
                        Checksum = checksum,
                        ContentHash = checksum,
                        UploadedDate = DateTime.Now
                    };

                    _context.ModelFiles.Add(modelFile);
                    await _context.SaveChangesAsync();

                    using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                    {
                        modelFile.StoragePath = await _storage.SaveModelAsync(fileStream, modelFile.ModelFileId, 1);
                    }

                    var downloadUrl = $"/api/agent-legacy/downloadmodel/{modelFile.ModelFileId}";

                    // Deduplication
                    var pendingCmds = await _context.AgentCommands
                        .Where(c => c.MCId == MCId && c.Status == "Pending" && c.CommandType == "UploadModel")
                        .ToListAsync();
                    if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                    var command = new AgentCommand
                    {
                        MCId = MCId,
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
                finally
                {
                    if (System.IO.File.Exists(tempPath))
                        System.IO.File.Delete(tempPath);
                }
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

                var stream = await _storage.GetModelStreamAsync(modelFile.StoragePath);
                if (stream == null)
                    return NotFound(new { error = "Model file not found on disk" });

                Response.Headers["X-Model-Checksum"] = modelFile.Checksum;
                return File(stream, "application/octet-stream", modelFile.FileName);
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
            if (!int.TryParse(modelName, out int MCId) || file == null || file.Length == 0)
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
                    _logger.LogWarning($"Request {requestId} not found or expired for PC {MCId}");
                    return Ok(new { message = "Log received (request not found)." });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing log upload for PC {MCId}");
                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Legacy endpoint for backward compatibility (no requestId).
        /// </summary>
        [HttpPost("uploadlog")]
        public async Task<IActionResult> UploadLog([FromForm] string modelName, IFormFile file)
        {
            if (!int.TryParse(modelName, out int MCId) || file == null || file.Length == 0)
            {
                return BadRequest($"Invalid PC ID '{modelName}' or Empty File");
            }

            try
            {
                // Find the active log request command (legacy flow)
                var pendingCmd = await _context.AgentCommands
                    .Where(c => c.MCId == MCId
                             && c.CommandType == "GetLogFileContent"
                             && (c.Status == "Pending" || c.Status == "InProgress"))
                    .OrderByDescending(c => c.CreatedDate)
                    .FirstOrDefaultAsync();

                if (pendingCmd == null)
                {
                    return NotFound($"No active log request found for PC {MCId}.");
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
                _logger.LogError(ex, $"Error processing log upload for PC {MCId}");
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
