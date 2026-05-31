using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Features.Logs.Services;
using LensAssemblyMonitoringWeb.Features.Yield.Services;
using LensAssemblyMonitoringWeb.Shared.FileSystem;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.IO.Compression;
using System.Text;

namespace LensAssemblyMonitoringWeb.Features.Models.Controllers
{

    public class FileChangeLog
    {
        public string Path { get; set; } = default!;
        public string ChangeType { get; set; } = default!; 
        public string OldContent { get; set; } = default!;
        public string NewContent { get; set; } = default!;
    }

    public class HistoryLogData
    {
        public string Summary { get; set; } = default!;
        public List<FileChangeLog> Changes { get; set; } = default!;
    }

    public class UpdateFileRequest
    {
        public string Path { get; set; } = default!;
        public string Content { get; set; } = default!;
    }

    public class BulkUpdateFileRequest
    {
        public List<UpdateFileRequest> Updates { get; set; } = default!;
    }

    public class DownloadRequestStatus
    {
        public string Status { get; set; } = default!;
        public string FilePath { get; set; } = default!;
        public string FileName { get; set; } = default!;
        public string Error { get; set; } = default!;
        public DateTime CreatedAt { get; set; }
    }

    public class DownloadFromPCRequest
    {
        public int MCId { get; set; }
        public string ModelName { get; set; } = default!;
    }

    /// <summary>
    /// Request payload used to apply or stage a template model package on selected machine controllers.
    /// </summary>
    public class ApplyModelRequest
    {
        /// <summary>
        /// Unique ID of the template model package in the library database.
        /// </summary>
        /// <example>12</example>
        public int ModelFileId { get; set; }

        /// <summary>
        /// Target machine targeting scope. Supported: 'all', 'version', 'line', 'lineandversion', or 'selected'.
        /// </summary>
        /// <example>line</example>
        public string TargetType { get; set; } = "all";

        /// <summary>
        /// Hardware generation/version sequence to filter targets by.
        /// </summary>
        /// <example>v1.2.0</example>
        public string? Version { get; set; }

        /// <summary>
        /// Assembly line number to filter target machines by.
        /// </summary>
        /// <example>2</example>
        public int? LineNumber { get; set; }

        /// <summary>
        /// Collection of exact Machine Controller database IDs to deploy this model to (used when TargetType is 'selected').
        /// </summary>
        /// <example>[1, 2, 3]</example>
        public List<int>? SelectedMCIds { get; set; }

        /// <summary>
        /// Automatically command the target agents to apply/switch to this model on download completion.
        /// </summary>
        /// <example>true</example>
        public bool ApplyImmediately { get; set; } = true;

        /// <summary>
        /// Perform preflight targeting verification checks without creating actual agent command queue entries.
        /// </summary>
        /// <example>false</example>
        public bool CheckOnly { get; set; } = false;

        /// <summary>
        /// Force re-download and overwrite on target MC even if an identical model name is already present locally.
        /// </summary>
        /// <example>true</example>
        public bool ForceOverwrite { get; set; } = false;

        /// <summary>
        /// Override model name keyword.
        /// </summary>
        /// <example>lens_standard_A</example>
        public string? ModelName { get; set; }
    }

    public class DeleteLineModelRequest
    {
        public int LineNumber { get; set; }
        public string ModelName { get; set; } = default!;
    }

    [Route("api/[controller]")]
    [ApiController]
    public class ModelLibraryController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<ModelLibraryController> _logger;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IModelStorageService _storage;
        private readonly IModelValidationService _validation;
        private readonly IHubContext<AgentHub> _hubContext;

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus> _downloadRequests
            = new System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus>();

        public ModelLibraryController(
            LensAssemblyDbContext context,
            ILogger<ModelLibraryController> logger,
            IHttpContextAccessor httpContextAccessor,
            IModelStorageService storage,
            IModelValidationService validation,
            IHubContext<AgentHub> hubContext)
        {
            _context = context;
            _logger = logger;
            _httpContextAccessor = httpContextAccessor;
            _storage = storage;
            _validation = validation;
            _hubContext = hubContext;
        }

        private string GetBaseUrl()
        {
            var request = _httpContextAccessor.HttpContext?.Request;
            if (request == null) return string.Empty;
            return $"{request.Scheme}://{request.Host}";
        }

        /// <summary>
        /// Saves bulk file changes to a template model in the library.
        /// </summary>
        [HttpPost("{id}/save-files")]
        [ProducesResponseType(typeof(SaveFilesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<SaveFilesResponse>> SaveModelFiles(int id, [FromBody] BulkUpdateFileRequest request)
        {
            try
            {
                if (request.Updates == null || !request.Updates.Any())
                    return Ok(new SaveFilesResponse { Success = true, Message = "No changes to save.", Count = 0 });

                var model = await _context.ModelFiles.FirstOrDefaultAsync(m => m.ModelFileId == id);
                if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });

                var historyData = new HistoryLogData
                {
                    Summary = $"Updated {request.Updates.Count} file(s) via Editor",
                    Changes = new List<FileChangeLog>()
                };

                var lastVer = await _context.GenerationNos
                    .Where(v => v.ModelFileId == id)
                    .MaxAsync(v => (int?)v.VersionNumber) ?? 0;

                using (var ms = new MemoryStream())
                {
                    
                    var currentStream = await _storage.GetModelStreamAsync(model.StoragePath);
                    if (currentStream == null)
                        return NotFound(new ApiErrorResponse { Message = "Model file not found on disk", ErrorCode = "model_file_missing" });
                    
                    await currentStream.CopyToAsync(ms);
                    await currentStream.DisposeAsync();
                    ms.Position = 0;

                    using (var archive = new ZipArchive(ms, ZipArchiveMode.Update, true))
                    {
                        foreach (var update in request.Updates)
                        {
                            
                            var entry = archive.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/').TrimStart('/') == update.Path.TrimStart('/'));
                            string oldContent = "";
                            string type = "ADDED";

                            if (entry != null)
                            {
                                type = "MODIFIED";
                                using (var oldStream = entry.Open())
                                using (var reader = new StreamReader(oldStream))
                                {
                                    oldContent = await reader.ReadToEndAsync();
                                }
                                entry.Delete();
                            }

                            if (oldContent != update.Content)
                            {
                                historyData.Changes.Add(new FileChangeLog
                                {
                                    Path = update.Path,
                                    ChangeType = type,
                                    OldContent = (type == "ADDED") ? "" : oldContent,
                                    NewContent = update.Content
                                });
                            }

                            var newEntry = archive.CreateEntry(update.Path);
                            using (var entryStream = newEntry.Open())
                            using (var writer = new StreamWriter(entryStream, Encoding.UTF8))
                            {
                                await writer.WriteAsync(update.Content);
                            }
                        }
                    }

                    ms.Position = 0;
                    var newStoragePath = await _storage.SaveModelAsync(ms, id, lastVer + 1);
                    var checksum = await _storage.ComputeChecksumAsync(_storage.GetFullPath(newStoragePath));

                    model.StoragePath = newStoragePath;
                    model.Checksum = checksum;
                    model.ContentHash = checksum;
                    model.FileSize = ms.Length;
                }

                model.UploadedDate = DateTime.Now;

                var jsonDetails = JsonConvert.SerializeObject(historyData);

                var logEntry = new SystemLog
                {
                    Timestamp = DateTime.Now,
                    ActionType = "Info",                
                    Action = "ModelLibrary Update",     
                    
                    Details = jsonDetails + $"\n[ModelID:{id}]"
                };

                _context.SystemLogs.Add(logEntry);

                var newVer = new GenerationNo
                {
                    ModelFileId = id,
                    VersionNumber = lastVer + 1,
                    StoragePath = model.StoragePath,
                    Checksum = model.Checksum,
                    FileSize = model.FileSize,
                    CreatedDate = DateTime.Now,
                    CreatedBy = "Editor", 
                    ChangeSummary = historyData.Summary
                };
                _context.GenerationNos.Add(newVer);

                await _context.SaveChangesAsync();

                return Ok(new SaveFilesResponse { Success = true, Message = "Files saved.", Count = request.Updates.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error bulk saving files in model {id}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse {
                    Message = "Failed to save files: " + ex.Message,
                    ErrorCode = "model_save_files_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves the modification history of a template model in the library.
        /// </summary>
        [HttpGet("{id}/history")]
        [ProducesResponseType(typeof(IEnumerable<ModelHistoryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<ModelHistoryDto>>> GetModelHistory(int id)
        {
            try
            {
                
                var history = await _context.SystemLogs
                    .Where(l => l.Action == "ModelLibrary Update" && l.Details != null && l.Details.Contains($"[ModelID:{id}]"))
                    .OrderByDescending(l => l.Timestamp)
                    .Select(l => new ModelHistoryDto
                    {
                        LogId = l.LogId,
                        Timestamp = l.Timestamp,
                        Details = l.Details
                    })
                    .ToListAsync();

                return Ok(history);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving history for model {id}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to retrieve history" });
            }
        }

        /// <summary>
        /// Retrieves the file structure of a template model in the library.
        /// </summary>
        [HttpGet("{id}/structure")]
        [ProducesResponseType(typeof(IEnumerable<ZipEntryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<ZipEntryDto>>> GetModelStructure(int id)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id)
                    .Select(m => new { m.StoragePath })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });

                var stream = await _storage.GetModelStreamAsync(model.StoragePath);
                if (stream == null) return NotFound(new ApiErrorResponse { Message = "Model file not found on disk", ErrorCode = "model_file_missing" });

                using (stream)
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    var entries = archive.Entries.Select(e => new ZipEntryDto
                    {
                        Path = e.FullName.Replace('\\', '/'),
                        Size = e.Length,
                        IsDirectory = string.IsNullOrEmpty(e.Name) || e.FullName.Replace('\\', '/').EndsWith("/")
                    }).OrderBy(e => e.Path).ToList();

                    return Ok(entries);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reading structure for model {id}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse {
                    Message = "Failed to read model structure",
                    ErrorCode = "model_structure_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves the text content of a specific file within a template model.
        /// </summary>
        [HttpGet("{id}/file-content")]
        [ProducesResponseType(typeof(FileContentResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<FileContentResponse>> GetModelFileContent(int id, [FromQuery] string path)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id)
                    .Select(m => new { m.StoragePath })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });

                var stream = await _storage.GetModelStreamAsync(model.StoragePath);
                if (stream == null) return NotFound(new ApiErrorResponse { Message = "Model file not found on disk", ErrorCode = "model_file_missing" });

                using (stream)
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    
                    var entry = archive.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/').TrimStart('/') == path.TrimStart('/'));
                    if (entry == null) return NotFound(new ApiErrorResponse { Message = "File not found in archive", ErrorCode = "archive_entry_not_found" });

                    var ext = Path.GetExtension(entry.Name).ToLower();
                    var allowedExtensions = new[] { ".json", ".xml", ".txt", ".ini", ".conf", ".config", ".py", ".js", ".md", ".csv", ".log" };

                    if (!allowedExtensions.Contains(ext))
                        return BadRequest(new ApiErrorResponse { Message = "Binary file viewing not supported", ErrorCode = "binary_file_not_supported" });

                    using var entryStream = entry.Open();
                    using var reader = new StreamReader(entryStream);
                    string content = await reader.ReadToEndAsync();

                    return Ok(new FileContentResponse { Content = content });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reading file {path} from model {id}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse {
                    Message = "Failed to read file content",
                    ErrorCode = "model_file_content_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves a list of template models available in the library.
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(IEnumerable<ModelLibraryItemDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<ModelLibraryItemDto>>> GetLibraryModels()
        {
            var models = await _context.ModelFiles
                .Where(m => m.IsTemplate && m.IsActive)
                .OrderByDescending(m => m.UploadedDate)
                .Select(m => new ModelLibraryItemDto
                {
                    ModelFileId = m.ModelFileId,
                    ModelName = m.ModelName,
                    FileName = m.FileName,
                    FileSize = m.FileSize,
                    Description = m.Description,
                    Category = m.Category,
                    UploadedDate = m.UploadedDate,
                    UploadedBy = m.UploadedBy
                })
                .ToListAsync();
            return Ok(models);
        }

        /// <summary>
        /// Retrieves metadata for a specific template model in the library.
        /// </summary>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ModelLibraryItemDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<ModelLibraryItemDto>> GetModel(int id)
        {
            var model = await _context.ModelFiles.Where(m => m.ModelFileId == id && m.IsTemplate)
                .Select(m => new ModelLibraryItemDto
                {
                    ModelFileId = m.ModelFileId,
                    ModelName = m.ModelName,
                    FileName = m.FileName,
                    FileSize = m.FileSize,
                    Description = m.Description,
                    Category = m.Category,
                    UploadedDate = m.UploadedDate,
                    UploadedBy = m.UploadedBy
                })
                .FirstOrDefaultAsync();
            if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found" });
            return Ok(model);
        }

        /// <summary>
        /// Uploads a new model template zip file into the library.
        /// </summary>
        [HttpPost("upload")]
        [Consumes("multipart/form-data")]
        [DisableRequestSizeLimit]
        [ProducesResponseType(typeof(ModelUploadResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ModelLibraryConflictResponse), StatusCodes.Status409Conflict)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ModelUploadResponse>> UploadModel(IFormFile file, [FromForm] string modelName, [FromForm] string? description, [FromForm] string? category, [FromForm] bool updateExisting = false, [FromForm] bool keepBoth = false)
        {
            if (file == null || file.Length == 0) return BadRequest(new ApiErrorResponse { Message = "No file uploaded" });
            if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new ApiErrorResponse { Message = "Only .zip files are accepted" });
            if (string.IsNullOrWhiteSpace(modelName)) modelName = Path.GetFileNameWithoutExtension(file.FileName);

            modelName = modelName.Trim();

            var tempPath = Path.Combine(Path.GetTempPath(), "LensAssemblyUploads", Guid.NewGuid() + ".zip");
            Directory.CreateDirectory(Path.GetDirectoryName(tempPath)!);
            try
            {
                using (var stream = new FileStream(tempPath, FileMode.Create))
                    await file.CopyToAsync(stream);

                var validationResult = await _validation.ValidateZipAsync(tempPath);
                if (!validationResult.IsValid)
                    return BadRequest(new ApiErrorResponse { Message = validationResult.ErrorMessage ?? "Model zip validation failed" });

                var checksum = await _storage.ComputeChecksumAsync(tempPath);

                var existing = await _context.ModelFiles
                    .FirstOrDefaultAsync(m => m.ContentHash == checksum && m.IsActive);
                if (existing != null)
                    return Conflict(new ModelLibraryConflictResponse
                    {
                        ConflictType = "Content",
                        Error = $"Identical model already exists: '{existing.ModelName}' (ID: {existing.ModelFileId})",
                        ExistingModelFileId = existing.ModelFileId,
                        ExistingModelName = existing.ModelName
                    });

                var existingName = await _context.ModelFiles
                    .FirstOrDefaultAsync(m => m.ModelName == modelName && m.IsActive);
                
                if (existingName != null && !updateExisting && !keepBoth)
                {
                    return Conflict(new ModelLibraryConflictResponse
                    {
                        ConflictType = "Name",
                        Error = "Name conflict detected.",
                        ExistingModelName = existingName.ModelName
                    });
                }

                if (existingName != null && updateExisting)
                {
                    
                    var lastVer = await _context.GenerationNos
                        .Where(v => v.ModelFileId == existingName.ModelFileId)
                        .MaxAsync(v => (int?)v.VersionNumber) ?? 0;
                        
                    int newVersionNumber = lastVer + 1;
                    
                    using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                    {
                        var newStoragePath = await _storage.SaveModelAsync(fileStream, existingName.ModelFileId, newVersionNumber);
                        
                        var ver = new GenerationNo
                        {
                            ModelFileId = existingName.ModelFileId,
                            VersionNumber = newVersionNumber,
                            StoragePath = newStoragePath,
                            Checksum = checksum,
                            FileSize = file.Length,
                            CreatedDate = DateTime.Now,
                            CreatedBy = existingName.UploadedBy ?? "Upload",
                            ChangeSummary = "Updated existing model via upload"
                        };
                        _context.GenerationNos.Add(ver);
                        
                        existingName.StoragePath = newStoragePath;
                        existingName.Checksum = checksum;
                        existingName.ContentHash = checksum;
                        existingName.FileSize = file.Length;
                        existingName.UploadedDate = DateTime.Now;
                        
                        await _context.SaveChangesAsync();
                        
                        return Ok(new ModelUploadResponse
                        {
                            Success = true,
                            Message = $"Successfully updated '{existingName.ModelName}' to version {newVersionNumber}",
                            ModelFileId = existingName.ModelFileId,
                            ModelName = existingName.ModelName,
                            Checksum = checksum
                        });
                    }
                }

                if (existingName != null && keepBoth)
                {
                    
                    var baseName = modelName;
                    int counter = 1;
                    while (await _context.ModelFiles.AnyAsync(m => m.ModelName == modelName && m.IsActive))
                    {
                        modelName = $"{baseName} ({counter})";
                        counter++;
                    }
                }

                var modelFile = new ModelFile
                {
                    ModelName = modelName,
                    FileName = file.FileName,
                    StoragePath = "", 
                    FileSize = file.Length,
                    Checksum = checksum,
                    ContentHash = checksum,
                    UploadedDate = DateTime.Now,
                    IsActive = true,
                    IsTemplate = true,
                    Description = description,
                    Category = category
                };

                _context.ModelFiles.Add(modelFile);
                
                try 
                {
                    await _context.SaveChangesAsync(); 
                }
                catch (DbUpdateException)
                {

                    return Conflict(new ModelLibraryConflictResponse
                    {
                        ConflictType = "Name",
                        Error = "Name conflict detected.",
                        ExistingModelName = modelName
                    });
                }

                using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                {
                    modelFile.StoragePath = await _storage.SaveModelAsync(fileStream, modelFile.ModelFileId, 1);
                }

                var version = new GenerationNo
                {
                    ModelFileId = modelFile.ModelFileId,
                    VersionNumber = 1,
                    StoragePath = modelFile.StoragePath,
                    Checksum = checksum,
                    FileSize = file.Length,
                    CreatedDate = DateTime.Now,
                    CreatedBy = modelFile.UploadedBy ?? "Upload",
                    ChangeSummary = "Initial Upload"
                };
                _context.GenerationNos.Add(version);
                await _context.SaveChangesAsync();

                return Ok(new ModelUploadResponse
                {
                    Success = true,
                    Message = "Model uploaded and validated successfully",
                    ModelFileId = modelFile.ModelFileId,
                    ModelName = modelFile.ModelName,
                    Checksum = checksum
                });
            }
            finally
            {
                if (System.IO.File.Exists(tempPath))
                    System.IO.File.Delete(tempPath);
            }
        }

        /// <summary>
        /// Applies a library model to one or more target machines.
        /// </summary>
        [HttpPost("apply")]
        [ProducesResponseType(typeof(ModelApplyResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ModelApplyResponse>> ApplyModelToTargets([FromBody] ApplyModelRequest request)
        {
            try
            {
                string? targetModelName = null;
                ModelFile? modelFile = null;

                if (request.ModelFileId > 0)
                {
                    modelFile = await _context.ModelFiles.FindAsync(request.ModelFileId);
                    if (modelFile == null) return NotFound(new ApiErrorResponse { Message = "Model not found in library" });
                    targetModelName = modelFile.ModelName;
                }
                else if (!string.IsNullOrEmpty(request.ModelName)) targetModelName = request.ModelName;
                else return BadRequest(new ApiErrorResponse { Message = "Either ModelFileId or ModelName must be provided" });

                var query = _context.LensAssemblyMCs.AsQueryable();
                if (request.TargetType == "version" && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.GenerationNo == request.Version);
                else if (request.TargetType == "line" && request.LineNumber.HasValue) query = query.Where(p => p.LineNumber == request.LineNumber.Value);
                else if (request.TargetType == "lineandversion" && request.LineNumber.HasValue && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.LineNumber == request.LineNumber.Value && p.GenerationNo == request.Version);
                else if (request.TargetType == "selected" && request.SelectedMCIds != null) query = query.Where(p => request.SelectedMCIds.Contains(p.MCId));

                var targetPCs = await query.ToListAsync();
                if (targetPCs.Count == 0) return BadRequest(new ApiErrorResponse { Message = "No PCs match the specified criteria" });

                if (request.CheckOnly)
                {
                    var targetPCIds = targetPCs.Select(p => p.MCId).ToList();
                    var existingModels = await _context.Models.Where(m => targetPCIds.Contains(m.MCId) && m.ModelName == targetModelName).Select(m => m.MCId).ToListAsync();
                    return Ok(new ModelApplyResponse
                    {
                        Success = true,
                        Checks = true,
                        TotalTargets = targetPCs.Count,
                        ExistingCount = existingModels.Count,
                        ExistingOnPCIds = existingModels
                    });
                }

                var baseUrl = GetBaseUrl();
                string? downloadUrl = modelFile != null ? $"{baseUrl}/api/agent/download/{modelFile.ModelFileId}" : null;

                foreach (var pc in targetPCs)
                {
                    var hasModel = await _context.Models.AnyAsync(m => m.MCId == pc.MCId && m.ModelName == targetModelName);
                    AgentCommand command;

                    if (hasModel && !request.ForceOverwrite)
                    {
                        var pending = await _context.AgentCommands.Where(c => c.MCId == pc.MCId && c.Status == "Pending" && c.CommandType == "ChangeModel").ToListAsync();
                        if (pending.Any()) _context.AgentCommands.RemoveRange(pending);
                        command = new AgentCommand { MCId = pc.MCId, CommandType = "ChangeModel", CommandData = JsonConvert.SerializeObject(new { ModelName = targetModelName }), Status = "Pending", CreatedDate = DateTime.Now };
                    }
                    else
                    {
                        ModelFile? pcModelFile = modelFile;
                        string? pcDownloadUrl = downloadUrl;

                        if (pcModelFile == null && !string.IsNullOrEmpty(targetModelName))
                        {
                            var mapping = await _context.LineModelMachineFiles
                                .FirstOrDefaultAsync(m => m.LineNumber == pc.LineNumber && m.Version == pc.GenerationNo && m.ModelName == targetModelName && m.McNumber == pc.MCNumber);
                            
                            if (mapping != null && mapping.ModelFileId.HasValue)
                            {
                                pcModelFile = await _context.ModelFiles.FindAsync(mapping.ModelFileId.Value);
                                if (pcModelFile != null)
                                {
                                    pcDownloadUrl = $"{baseUrl}/api/agent/download/{pcModelFile.ModelFileId}";
                                }
                            }
                        }

                        if (pcModelFile == null) continue;
                        
                        var pending = await _context.AgentCommands.Where(c => c.MCId == pc.MCId && c.Status == "Pending" && (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel")).ToListAsync();
                        if (pending.Any()) _context.AgentCommands.RemoveRange(pending);
                        command = new AgentCommand { MCId = pc.MCId, CommandType = "UploadModel", CommandData = JsonConvert.SerializeObject(new { ModelFileId = pcModelFile.ModelFileId, ModelName = pcModelFile.ModelName, FileName = pcModelFile.FileName, DownloadUrl = pcDownloadUrl, ApplyOnUpload = request.ApplyImmediately }), Status = "Pending", CreatedDate = DateTime.Now };
                    }
                    _context.AgentCommands.Add(command);
                }

                var affectedLines = targetPCs.GroupBy(p => new { p.LineNumber, p.GenerationNo }).Select(g => g.Key).ToList();
                foreach (var item in affectedLines)
                {
                    var lineTarget = await _context.LineTargetModels.FirstOrDefaultAsync(ltm => ltm.LineNumber == item.LineNumber && ltm.GenerationNo == item.GenerationNo);
                    if (lineTarget != null) { lineTarget.TargetModelName = targetModelName; lineTarget.Notes = $"Updated via {request.TargetType}"; }
                    else { _context.LineTargetModels.Add(new LineTargetModel { LineNumber = item.LineNumber, GenerationNo = item.GenerationNo, TargetModelName = targetModelName, SetByUser = "System", SetDate = DateTime.Now, Notes = $"Set via {request.TargetType}" }); }
                }

                await _context.SaveChangesAsync();

                var savedCommands = await _context.AgentCommands
                    .Where(c => targetPCs.Select(p => p.MCId).Contains(c.MCId)
                        && c.Status == "Pending"
                        && (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel"))
                    .ToListAsync();

                foreach (var cmd in savedCommands)
                {
                    try
                    {
                        await _hubContext.Clients.Group(cmd.MCId.ToString())
                            .SendAsync("ReceiveCommand",
                                cmd.CommandType,
                                cmd.CommandData,
                                cmd.CommandId.ToString());

                        cmd.Status = "Delivered";
                        cmd.ExecutedDate = DateTime.Now;
                    }
                    catch (Exception hubEx)
                    {
                        _logger.LogWarning(hubEx, "Failed to push command via SignalR to MC {MCId}", cmd.MCId);
                        
                    }
                }
                await _context.SaveChangesAsync();

                return Ok(new ModelApplyResponse
                {
                    Success = true,
                    Message = "Deployment initiated",
                    AffectedPCs = targetPCs.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying model");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Apply failed" });
            }
        }

        /// <summary>
        /// Gets available models for a specific line.
        /// </summary>
        [HttpGet("line-available/{lineNumber}")]
        [ProducesResponseType(typeof(IEnumerable<ModelLibraryLineAvailableModelDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<ModelLibraryLineAvailableModelDto>>> GetLineAvailableModels(int lineNumber, [FromQuery] string? version)
        {
            
            var query = _context.LensAssemblyMCs.Where(p => p.LineNumber == lineNumber);
            if (!string.IsNullOrEmpty(version)) query = query.Where(p => p.GenerationNo == version);
            var linePCs = await query.Select(p => p.MCId).ToListAsync();
            int totalPCs = linePCs.Count;
            if (totalPCs == 0) return Ok(new List<ModelLibraryLineAvailableModelDto>());

            var libraryModels = await _context.ModelFiles.Where(m => m.IsTemplate && m.IsActive).Select(m => new { m.ModelName, m.ModelFileId }).ToListAsync();
            var onPcModels = await _context.Models.Where(m => linePCs.Contains(m.MCId)).Select(m => new { m.ModelName, m.MCId }).ToListAsync();

            var lineModelsQuery = _context.LineBarrelConfigs.Where(bc => bc.LineNumber == lineNumber);
            if (!string.IsNullOrEmpty(version)) lineModelsQuery = lineModelsQuery.Where(bc => bc.Version == version);
            var lineModels = await lineModelsQuery.Select(bc => bc.ModelName).ToListAsync();

            var allNames = libraryModels.Select(m => m.ModelName)
                .Union(onPcModels.Select(m => m.ModelName))
                .Union(lineModels)
                .Distinct()
                .OrderBy(n => n)
                .ToList();

            var result = allNames.Select(name => new ModelLibraryLineAvailableModelDto
            {
                ModelName = name,
                ModelFileId = libraryModels.FirstOrDefault(m => m.ModelName == name)?.ModelFileId,
                InLibrary = libraryModels.Any(m => m.ModelName == name) || lineModels.Contains(name),
                AvailableOnMCIds = onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().ToList(),
                TotalPCsInLine = totalPCs,
                ComplianceCount = onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().Count(),
                ComplianceText = $"{onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().Count()} / {totalPCs} MCs"
            });
            return Ok(result);
        }

        /// <summary>
        /// Deletes a template model from the library.
        /// </summary>
        [HttpPost("delete/{id}")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<BasicResponse>> DeleteModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();

            var versions = await _context.GenerationNos.Where(v => v.ModelFileId == id).ToListAsync();
            foreach (var ver in versions)
            {
                await _storage.DeleteModelAsync(ver.StoragePath);
            }

            await _storage.DeleteModelAsync(model.StoragePath);

            _context.ModelFiles.Remove(model);
            await _context.SaveChangesAsync();
            return Ok(new BasicResponse { Success = true });
        }

        /// <summary>
        /// Downloads a model zip file from the library.
        /// </summary>
        [HttpGet("download/{id}")]
        [Produces("application/zip", "application/json")]
        [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DownloadModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();

            var stream = await _storage.GetModelStreamAsync(model.StoragePath);
            if (stream == null) return NotFound(new ApiErrorResponse { Message = "Model file not found on disk" });

            Response.Headers["X-Model-Checksum"] = model.Checksum;
            return File(stream, "application/zip", model.FileName);
        }

        /// <summary>
        /// Deletes a model from all machines in a specific line.
        /// </summary>
        [HttpPost("line-delete")]
        [ProducesResponseType(typeof(LineModelDeleteResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<LineModelDeleteResponse>> DeleteLineModel([FromBody] DeleteLineModelRequest request)
        {
            var linePCs = await _context.LensAssemblyMCs.Where(p => p.LineNumber == request.LineNumber).ToListAsync();
            if (!linePCs.Any()) return NotFound(new ApiErrorResponse { Message = "No MCs found in this line" });
            var pcIds = linePCs.Select(p => p.MCId).ToList();

            var pendingCommands = await _context.AgentCommands
                .Where(c => pcIds.Contains(c.MCId) && c.Status == "Pending" &&
                    (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel"))
                .ToListAsync();
            var commandsToCancel = pendingCommands
                .Where(c => c.CommandData != null && c.CommandData.Contains(request.ModelName))
                .ToList();
            if (commandsToCancel.Any()) _context.AgentCommands.RemoveRange(commandsToCancel);

            var modelEntries = await _context.Models
                .Where(m => pcIds.Contains(m.MCId) && m.ModelName == request.ModelName)
                .ToListAsync();
            if (modelEntries.Any()) _context.Models.RemoveRange(modelEntries);

            foreach (var pc in linePCs)
            {
                _context.AgentCommands.Add(new AgentCommand { MCId = pc.MCId, CommandType = "DeleteModel", CommandData = JsonConvert.SerializeObject(new { ModelName = request.ModelName }), Status = "Pending", CreatedDate = DateTime.Now });
            }

            await _context.SaveChangesAsync();
            return Ok(new LineModelDeleteResponse
            {
                Success = true,
                Message = $"Delete command sent to {linePCs.Count} MCs",
                CancelledCommands = commandsToCancel.Count,
                RemovedEntries = modelEntries.Count
            });
        }

        /// <summary>
        /// Serves a model zip file previously requested from a machine.
        /// </summary>
        [HttpGet("serve-download/{requestId}")]
        [Produces("application/zip", "text/plain")]
        [ProducesResponseType(typeof(PhysicalFileResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
        public ActionResult ServeDownload(string requestId)
        {
            if (!_downloadRequests.TryGetValue(requestId, out var status) || status.Status != "Ready" || !System.IO.File.Exists(status.FilePath))
            {
                return NotFound("File not ready or expired");
            }
            return PhysicalFile(status.FilePath, "application/zip", status.FileName);
        }

        /// <summary>
        /// Requests a machine to upload its model to the library.
        /// Transient command: uses pure SignalR push, no DB row. Status is tracked in-memory.
        /// </summary>
        [HttpPost("request-download")]
        [ProducesResponseType(typeof(DownloadRequestResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<DownloadRequestResponse>> RequestDownloadFromPC([FromBody] DownloadFromPCRequest request)
        {
            try
            {
                var requestId = Guid.NewGuid().ToString();
                var baseUrl = GetBaseUrl();
                var uploadUrl = $"{baseUrl}/api/ModelLibrary/receive-upload/{requestId}";

                var commandData = JsonConvert.SerializeObject(new
                {
                    ModelName = request.ModelName,
                    UploadUrl = uploadUrl
                });

                // Pure SignalR push — no DB row needed
                await _hubContext.Clients.Group(request.MCId.ToString())
                    .SendAsync("ReceiveCommand", "UploadModelToLib", commandData, requestId);

                _downloadRequests[requestId] = new DownloadRequestStatus { Status = "Pending", CreatedAt = DateTime.Now };

                return Ok(new DownloadRequestResponse { RequestId = requestId, Status = "Pending" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting download from PC");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to request download" });
            }
        }

        /// <summary>
        /// Receives the model zip upload from a machine to the library.
        /// </summary>
        [HttpPost("receive-upload/{requestId}")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(500 * 1024 * 1024)] 
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> ReceiveUploadFromAgent(string requestId, IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0) return BadRequest(new ApiErrorResponse { Message = "No file uploaded", ErrorCode = "model_upload_file_missing" });
                if (!_downloadRequests.ContainsKey(requestId)) return NotFound(new ApiErrorResponse { Message = "Invalid Request ID", ErrorCode = "invalid_download_request" });

                var tempPath = Path.Combine(Path.GetTempPath(), "LensAssemblyDownloads");
                Directory.CreateDirectory(tempPath);
                var filePath = Path.Combine(tempPath, $"{requestId}.zip");

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                _downloadRequests[requestId] = new DownloadRequestStatus
                {
                    Status = "Ready",
                    FilePath = filePath,
                    FileName = file.FileName,
                    CreatedAt = DateTime.Now
                };

                return Ok(new BasicResponse { Success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error receiving agent upload");
                _downloadRequests[requestId] = new DownloadRequestStatus { Status = "Failed", Error = ex.Message, CreatedAt = DateTime.Now };
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Upload failed", ErrorCode = "agent_upload_failed" });
            }
        }

        [HttpGet("check-status/{requestId}")]
        [ProducesResponseType(typeof(DownloadStatusResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public ActionResult<DownloadStatusResponse> CheckDownloadStatus(string requestId)
        {
            if (!_downloadRequests.TryGetValue(requestId, out var status))
            {
                return NotFound(new ApiErrorResponse { Message = "Request not found" });
            }
            return Ok(new DownloadStatusResponse { Status = status.Status, Error = status.Error });
        }

        [HttpGet("{id}/versions")]
        [ProducesResponseType(typeof(IEnumerable<ModelGenerationDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<ModelGenerationDto>>> GetGenerationNos(int id)
        {
            var versions = await _context.GenerationNos
                .Where(v => v.ModelFileId == id)
                .OrderByDescending(v => v.VersionNumber)
                .Select(v => new ModelGenerationDto
                {
                    GenerationNoId = v.GenerationNoId,
                    VersionNumber = v.VersionNumber,
                    CreatedDate = v.CreatedDate,
                    CreatedBy = v.CreatedBy,
                    ChangeSummary = v.ChangeSummary,
                    Size = v.FileSize
                })
                .ToListAsync();

            return Ok(versions);
        }

        [HttpPost("{id}/revert/{versionId}")]
        [ProducesResponseType(typeof(RevertGenerationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<RevertGenerationResponse>> RevertGenerationNo(int id, int versionId)
        {
            try
            {
                var model = await _context.ModelFiles.FindAsync(id);
                if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found" });

                var targetVersion = await _context.GenerationNos
                    .FirstOrDefaultAsync(v => v.GenerationNoId == versionId && v.ModelFileId == id);

                if (targetVersion == null) return NotFound(new ApiErrorResponse { Message = "Version not found" });

                model.StoragePath = targetVersion.StoragePath;
                model.Checksum = targetVersion.Checksum;
                model.ContentHash = targetVersion.Checksum;
                model.FileSize = targetVersion.FileSize;
                model.UploadedDate = DateTime.Now; 

                var lastVerNum = await _context.GenerationNos
                    .Where(v => v.ModelFileId == id)
                    .MaxAsync(v => (int?)v.VersionNumber) ?? 0;

                var newVersion = new GenerationNo
                {
                    ModelFileId = id,
                    VersionNumber = lastVerNum + 1,
                    StoragePath = targetVersion.StoragePath,
                    Checksum = targetVersion.Checksum,
                    FileSize = targetVersion.FileSize,
                    CreatedDate = DateTime.Now,
                    CreatedBy = "System", 
                    ChangeSummary = $"Reverted to Version {targetVersion.VersionNumber}"
                };

                _context.GenerationNos.Add(newVersion);

                var logEntry = new SystemLog
                {
                    Timestamp = DateTime.Now,
                    ActionType = "Info",
                    Action = "ModelLibrary Revert",
                    Details = $"Reverted model {model.ModelName} to version {targetVersion.VersionNumber} (v{newVersion.VersionNumber})\n[ModelID:{id}]"
                };
                _context.SystemLogs.Add(logEntry);

                await _context.SaveChangesAsync();

                return Ok(new RevertGenerationResponse { Success = true, NewVersion = newVersion.VersionNumber });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reverting model {id} to version {versionId}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Revert failed" });
            }
        }
    }
}






