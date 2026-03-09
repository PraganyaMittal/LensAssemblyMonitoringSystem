using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Model;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for model sync endpoint.
    /// </summary>
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class ModelController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly FactoryDbContext _context;
        private readonly IModelStorageService _storage;
        private readonly ILogger<ModelController> _logger;

        public ModelController(
            ICommandDispatcher dispatcher,
            FactoryDbContext context,
            IModelStorageService storage,
            ILogger<ModelController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _storage = storage ?? throw new ArgumentNullException(nameof(storage));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Syncs models from agent.
        /// </summary>
        [HttpPost("syncmodels")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> SyncModels(
            [FromBody] ModelSyncRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var modelInfos = request.Models.Select(m => new ModelSyncInfo
                {
                    ModelName = m.ModelName,
                    ModelPath = m.ModelPath,
                    IsCurrent = m.IsCurrent
                });

                var command = new SyncModelsCommand(request.MCId, modelInfos);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                return Ok(new ApiResponse
                {
                    Success = result.Success,
                    Message = result.Message,
                    Data = new
                    {
                        Inserted = result.InsertedCount,
                        Updated = result.UpdatedCount,
                        Removed = result.RemovedCount,
                        CurrentModel = result.CurrentModelName
                    }
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing models");
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }

        /// <summary>
        /// Endpoint for agent to upload model files back to server
        /// </summary>
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
                    {
                        await file.CopyToAsync(stream);
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

                    // Re-open for storage service
                    using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                    {
                        var storagePath = await _storage.SaveModelAsync(fileStream, modelFile.ModelFileId, 1);
                        modelFile.StoragePath = storagePath;
                        await _context.SaveChangesAsync();
                        
                        return Ok(new ApiResponse
                        {
                            Success = true,
                            Message = "Model file uploaded successfully",
                            Data = new { 
                                StoragePath = storagePath,
                                Checksum = checksum,
                                OriginalName = file.FileName,
                                ModelFileId = modelFile.ModelFileId
                            }
                        });
                    }
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

                    var downloadUrl = $"/api/agent/download/{modelFile.ModelFileId}";

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

        [HttpGet("download/{modelFileId}")]
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
    }
}
