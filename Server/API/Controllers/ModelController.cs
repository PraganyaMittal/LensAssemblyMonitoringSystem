using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Model;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Controllers
{

    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class ModelController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly LensAssemblyDbContext _context;
        private readonly IModelStorageService _storage;
        private readonly ILogger<ModelController> _logger;

        public ModelController(
            ICommandDispatcher dispatcher,
            LensAssemblyDbContext context,
            IModelStorageService storage,
            ILogger<ModelController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _storage = storage ?? throw new ArgumentNullException(nameof(storage));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Syncs the list of models currently available on an agent with the server.
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
        /// Handles direct file upload of individual model files from an agent.
        /// </summary>
        [HttpPost("uploadmodelfile")]
        [Consumes("multipart/form-data")]
        [DisableRequestSizeLimit]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> UploadModelFile(IFormFile file, [FromForm] string modelName)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "No file uploaded" });
                }

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                var allowedExtensions = new[] { ".zip", ".json", ".xml", ".config" };
                if (!allowedExtensions.Contains(ext))
                {
                    return BadRequest(new ApiResponse { Success = false, Message = "Invalid file type. Allowed: .zip, .json, .xml, .config" });
                }

                var tempPath = Path.Combine(Path.GetTempPath(), "LensAssemblyUploads", Guid.NewGuid() + ext);
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

        /// <summary>
        /// Handles .zip upload of a full model from the dashboard to be deployed to an agent.
        /// </summary>
        [HttpPost("uploadmodel")]
        [Consumes("multipart/form-data")]
        [DisableRequestSizeLimit]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> UploadModel(IFormFile file, [FromForm] string modelName, [FromForm] int MCId)
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

                var tempPath = Path.Combine(Path.GetTempPath(), "LensAssemblyUploads", Guid.NewGuid() + ".zip");
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

        /// <summary>
        /// Downloads a specific model file from the server's storage.
        /// </summary>
        [HttpGet("download/{modelFileId}")]
        [Produces("application/octet-stream", "application/json")]
        [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
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
                    return NotFound(new ErrorOnlyResponse { Error = "Model file not found on disk" });

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

