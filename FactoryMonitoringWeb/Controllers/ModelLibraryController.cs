using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.IO.Compression;
using System.Text;

namespace FactoryMonitoringWeb.Controllers
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

    public class ApplyModelRequest
    {
        public int ModelFileId { get; set; }
        public string TargetType { get; set; } = "all";
        public string? Version { get; set; }
        public int? LineNumber { get; set; }
        public List<int>? SelectedMCIds { get; set; }
        public bool ApplyImmediately { get; set; } = true;
        public bool CheckOnly { get; set; } = false;
        public bool ForceOverwrite { get; set; } = false;
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
        private readonly FactoryDbContext _context;
        private readonly ILogger<ModelLibraryController> _logger;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IModelStorageService _storage;
        private readonly IModelValidationService _validation;
        private readonly IHubContext<AgentHub> _hubContext;

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus> _downloadRequests
            = new System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus>();

        public ModelLibraryController(
            FactoryDbContext context,
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

        [HttpPost("{id}/save-files")]
        public async Task<IActionResult> SaveModelFiles(int id, [FromBody] BulkUpdateFileRequest request)
        {
            try
            {
                if (request.Updates == null || !request.Updates.Any())
                    return Ok(new { success = true, message = "No changes to save." });

                var model = await _context.ModelFiles.FirstOrDefaultAsync(m => m.ModelFileId == id);
                if (model == null) return NotFound(new { error = "Model not found" });

                var historyData = new HistoryLogData
                {
                    Summary = $"Updated {request.Updates.Count} file(s) via Editor",
                    Changes = new List<FileChangeLog>()
                };

                var lastVer = await _context.ModelVersions
                    .Where(v => v.ModelFileId == id)
                    .MaxAsync(v => (int?)v.VersionNumber) ?? 0;

                using (var ms = new MemoryStream())
                {
                    
                    var currentStream = await _storage.GetModelStreamAsync(model.StoragePath);
                    if (currentStream == null)
                        return NotFound(new { error = "Model file not found on disk" });
                    
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

                var newVer = new ModelVersion
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
                _context.ModelVersions.Add(newVer);

                await _context.SaveChangesAsync();

                return Ok(new { success = true, count = request.Updates.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error bulk saving files in model {id}");
                return StatusCode(500, new { error = "Failed to save files: " + ex.Message });
            }
        }

        [HttpGet("{id}/history")]
        public async Task<ActionResult<IEnumerable<object>>> GetModelHistory(int id)
        {
            try
            {
                
                var history = await _context.SystemLogs
                    .Where(l => l.Action == "ModelLibrary Update" && l.Details.Contains($"[ModelID:{id}]"))
                    .OrderByDescending(l => l.Timestamp)
                    .Select(l => new
                    {
                        l.LogId,
                        l.Timestamp,
                        
                        details = l.Details
                    })
                    .ToListAsync();

                return Ok(history);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving history for model {id}");
                return StatusCode(500, new { error = "Failed to retrieve history" });
            }
        }

        [HttpGet("{id}/structure")]
        public async Task<ActionResult<IEnumerable<object>>> GetModelStructure(int id)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id)
                    .Select(m => new { m.StoragePath })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound(new { error = "Model not found" });

                var stream = await _storage.GetModelStreamAsync(model.StoragePath);
                if (stream == null) return NotFound(new { error = "Model file not found on disk" });

                using (stream)
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    var entries = archive.Entries.Select(e => new
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
                return StatusCode(500, new { error = "Failed to read model structure" });
            }
        }

        [HttpGet("{id}/file-content")]
        public async Task<ActionResult<object>> GetModelFileContent(int id, [FromQuery] string path)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id)
                    .Select(m => new { m.StoragePath })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound();

                var stream = await _storage.GetModelStreamAsync(model.StoragePath);
                if (stream == null) return NotFound(new { error = "Model file not found on disk" });

                using (stream)
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    
                    var entry = archive.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/').TrimStart('/') == path.TrimStart('/'));
                    if (entry == null) return NotFound(new { error = "File not found in archive" });

                    var ext = Path.GetExtension(entry.Name).ToLower();
                    var allowedExtensions = new[] { ".json", ".xml", ".txt", ".ini", ".conf", ".config", ".py", ".js", ".md", ".csv", ".log" };

                    if (!allowedExtensions.Contains(ext))
                        return BadRequest(new { error = "Binary file viewing not supported" });

                    using var entryStream = entry.Open();
                    using var reader = new StreamReader(entryStream);
                    string content = await reader.ReadToEndAsync();

                    return Ok(new { content });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reading file {path} from model {id}");
                return StatusCode(500, new { error = "Failed to read file content" });
            }
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetLibraryModels()
        {
            var models = await _context.ModelFiles
                .Where(m => m.IsTemplate && m.IsActive)
                .OrderByDescending(m => m.UploadedDate)
                .Select(m => new { m.ModelFileId, m.ModelName, m.FileName, m.FileSize, m.Description, m.Category, m.UploadedDate, m.UploadedBy })
                .ToListAsync();
            return Ok(models);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetModel(int id)
        {
            var model = await _context.ModelFiles.Where(m => m.ModelFileId == id && m.IsTemplate)
                .Select(m => new { m.ModelFileId, m.ModelName, m.FileName, m.FileSize, m.Description, m.Category, m.UploadedDate, m.UploadedBy })
                .FirstOrDefaultAsync();
            if (model == null) return NotFound(new { error = "Model not found" });
            return Ok(model);
        }

        [HttpPost("upload")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult<object>> UploadModel([FromForm] IFormFile file, [FromForm] string modelName, [FromForm] string? description, [FromForm] string? category, [FromForm] bool updateExisting = false, [FromForm] bool keepBoth = false)
        {
            if (file == null || file.Length == 0) return BadRequest(new { error = "No file uploaded" });
            if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "Only .zip files are accepted" });
            if (string.IsNullOrWhiteSpace(modelName)) modelName = Path.GetFileNameWithoutExtension(file.FileName);

            modelName = modelName.Trim();

            var tempPath = Path.Combine(Path.GetTempPath(), "FactoryUploads", Guid.NewGuid() + ".zip");
            Directory.CreateDirectory(Path.GetDirectoryName(tempPath)!);
            try
            {
                using (var stream = new FileStream(tempPath, FileMode.Create))
                    await file.CopyToAsync(stream);

                var validationResult = await _validation.ValidateZipAsync(tempPath);
                if (!validationResult.IsValid)
                    return BadRequest(new { error = validationResult.ErrorMessage });

                var checksum = await _storage.ComputeChecksumAsync(tempPath);

                var existing = await _context.ModelFiles
                    .FirstOrDefaultAsync(m => m.ContentHash == checksum && m.IsActive);
                if (existing != null)
                    return Conflict(new {
                        conflictType = "Content",
                        error = $"Identical model already exists: '{existing.ModelName}' (ID: {existing.ModelFileId})",
                        existingModelFileId = existing.ModelFileId,
                        existingModelName = existing.ModelName
                    });

                var existingName = await _context.ModelFiles
                    .FirstOrDefaultAsync(m => m.ModelName == modelName && m.IsActive);
                
                if (existingName != null && !updateExisting && !keepBoth)
                {
                    return Conflict(new {
                        conflictType = "Name",
                        error = "Name conflict detected.",
                        existingModelName = existingName.ModelName
                    });
                }

                if (existingName != null && updateExisting)
                {
                    
                    var lastVer = await _context.ModelVersions
                        .Where(v => v.ModelFileId == existingName.ModelFileId)
                        .MaxAsync(v => (int?)v.VersionNumber) ?? 0;
                        
                    int newVersionNumber = lastVer + 1;
                    
                    using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                    {
                        var newStoragePath = await _storage.SaveModelAsync(fileStream, existingName.ModelFileId, newVersionNumber);
                        
                        var ver = new ModelVersion
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
                        _context.ModelVersions.Add(ver);
                        
                        existingName.StoragePath = newStoragePath;
                        existingName.Checksum = checksum;
                        existingName.ContentHash = checksum;
                        existingName.FileSize = file.Length;
                        existingName.UploadedDate = DateTime.Now;
                        
                        await _context.SaveChangesAsync();
                        
                        return Ok(new {
                            success = true,
                            message = $"Successfully updated '{existingName.ModelName}' to version {newVersionNumber}",
                            modelFileId = existingName.ModelFileId,
                            modelName = existingName.ModelName,
                            checksum = checksum
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

                    return Conflict(new {
                        conflictType = "Name",
                        error = "Name conflict detected.",
                        existingModelName = modelName
                    });
                }

                using (var fileStream = new FileStream(tempPath, FileMode.Open, FileAccess.Read))
                {
                    modelFile.StoragePath = await _storage.SaveModelAsync(fileStream, modelFile.ModelFileId, 1);
                }

                var version = new ModelVersion
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
                _context.ModelVersions.Add(version);
                await _context.SaveChangesAsync();

                return Ok(new {
                    success = true,
                    message = "Model uploaded and validated successfully",
                    modelFileId = modelFile.ModelFileId,
                    modelName = modelFile.ModelName,
                    checksum = checksum
                });
            }
            finally
            {
                if (System.IO.File.Exists(tempPath))
                    System.IO.File.Delete(tempPath);
            }
        }

        [HttpPost("apply")]
        public async Task<ActionResult<object>> ApplyModelToTargets([FromBody] ApplyModelRequest request)
        {
            try
            {
                string? targetModelName = null;
                ModelFile? modelFile = null;

                if (request.ModelFileId > 0)
                {
                    modelFile = await _context.ModelFiles.FindAsync(request.ModelFileId);
                    if (modelFile == null) return NotFound(new { error = "Model not found in library" });
                    targetModelName = modelFile.ModelName;
                }
                else if (!string.IsNullOrEmpty(request.ModelName)) targetModelName = request.ModelName;
                else return BadRequest(new { error = "Either ModelFileId or ModelName must be provided" });

                var query = _context.FactoryMCs.AsQueryable();
                if (request.TargetType == "version" && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.ModelVersion == request.Version);
                else if (request.TargetType == "line" && request.LineNumber.HasValue) query = query.Where(p => p.LineNumber == request.LineNumber.Value);
                else if (request.TargetType == "lineandversion" && request.LineNumber.HasValue && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.LineNumber == request.LineNumber.Value && p.ModelVersion == request.Version);
                else if (request.TargetType == "selected" && request.SelectedMCIds != null) query = query.Where(p => request.SelectedMCIds.Contains(p.MCId));

                var targetPCs = await query.ToListAsync();
                if (targetPCs.Count == 0) return BadRequest(new { error = "No PCs match the specified criteria" });

                if (request.CheckOnly)
                {
                    var targetPCIds = targetPCs.Select(p => p.MCId).ToList();
                    var existingModels = await _context.Models.Where(m => targetPCIds.Contains(m.MCId) && m.ModelName == targetModelName).Select(m => m.MCId).ToListAsync();
                    return Ok(new { success = true, checks = true, totalTargets = targetPCs.Count, existingCount = existingModels.Count, existingOnPCIds = existingModels });
                }

                var baseUrl = GetBaseUrl();
                string downloadUrl = modelFile != null ? $"{baseUrl}/api/agent/download/{modelFile.ModelFileId}" : null;

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
                        if (modelFile == null) continue;
                        var pending = await _context.AgentCommands.Where(c => c.MCId == pc.MCId && c.Status == "Pending" && (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel")).ToListAsync();
                        if (pending.Any()) _context.AgentCommands.RemoveRange(pending);
                        command = new AgentCommand { MCId = pc.MCId, CommandType = "UploadModel", CommandData = JsonConvert.SerializeObject(new { ModelFileId = modelFile.ModelFileId, ModelName = modelFile.ModelName, FileName = modelFile.FileName, DownloadUrl = downloadUrl, ApplyOnUpload = request.ApplyImmediately }), Status = "Pending", CreatedDate = DateTime.Now };
                    }
                    _context.AgentCommands.Add(command);
                }

                var affectedLines = targetPCs.GroupBy(p => new { p.LineNumber, p.ModelVersion }).Select(g => g.Key).ToList();
                foreach (var item in affectedLines)
                {
                    var lineTarget = await _context.LineTargetModels.FirstOrDefaultAsync(ltm => ltm.LineNumber == item.LineNumber && ltm.ModelVersion == item.ModelVersion);
                    if (lineTarget != null) { lineTarget.TargetModelName = targetModelName; lineTarget.LastUpdated = DateTime.Now; lineTarget.Notes = $"Updated via {request.TargetType}"; }
                    else { _context.LineTargetModels.Add(new LineTargetModel { LineNumber = item.LineNumber, ModelVersion = item.ModelVersion, TargetModelName = targetModelName, SetByUser = "System", SetDate = DateTime.Now, LastUpdated = DateTime.Now, Notes = $"Set via {request.TargetType}" }); }
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

                return Ok(new { success = true, message = "Deployment initiated", affectedPCs = targetPCs.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying model");
                return StatusCode(500, new { error = "Apply failed" });
            }
        }

        [HttpGet("line-available/{lineNumber}")]
        public async Task<ActionResult> GetLineAvailableModels(int lineNumber, [FromQuery] string? version)
        {
            
            var query = _context.FactoryMCs.Where(p => p.LineNumber == lineNumber);
            if (!string.IsNullOrEmpty(version)) query = query.Where(p => p.ModelVersion == version);
            var linePCs = await query.Select(p => p.MCId).ToListAsync();
            int totalPCs = linePCs.Count;
            if (totalPCs == 0) return Ok(new List<object>());

            var libraryModels = await _context.ModelFiles.Where(m => m.IsTemplate && m.IsActive).Select(m => new { m.ModelName, m.ModelFileId }).ToListAsync();
            var onPcModels = await _context.Models.Where(m => linePCs.Contains(m.MCId)).Select(m => new { m.ModelName, m.MCId }).ToListAsync();

            var allNames = libraryModels.Select(m => m.ModelName).Union(onPcModels.Select(m => m.ModelName)).Distinct().OrderBy(n => n).ToList();
            var result = allNames.Select(name => new {
                ModelName = name,
                ModelFileId = libraryModels.FirstOrDefault(m => m.ModelName == name)?.ModelFileId,
                InLibrary = libraryModels.Any(m => m.ModelName == name),
                AvailableOnMCIds = onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().ToList(),
                TotalPCsInLine = totalPCs,
                ComplianceCount = onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().Count(),
                ComplianceText = $"{onPcModels.Where(m => m.ModelName == name).Select(m => m.MCId).Distinct().Count()} / {totalPCs} MCs"
            });
            return Ok(result);
        }

        [HttpPost("delete/{id}")]
        public async Task<ActionResult> DeleteModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();

            var versions = await _context.ModelVersions.Where(v => v.ModelFileId == id).ToListAsync();
            foreach (var ver in versions)
            {
                await _storage.DeleteModelAsync(ver.StoragePath);
            }

            await _storage.DeleteModelAsync(model.StoragePath);

            _context.ModelFiles.Remove(model);
            await _context.SaveChangesAsync();
            return Ok(new { success = true });
        }

        [HttpGet("download/{id}")]
        public async Task<IActionResult> DownloadModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();

            var stream = await _storage.GetModelStreamAsync(model.StoragePath);
            if (stream == null) return NotFound(new { error = "Model file not found on disk" });

            Response.Headers["X-Model-Checksum"] = model.Checksum;
            return File(stream, "application/zip", model.FileName);
        }

        [HttpPost("line-delete")]
        public async Task<ActionResult> DeleteLineModel([FromBody] DeleteLineModelRequest request)
        {
            var linePCs = await _context.FactoryMCs.Where(p => p.LineNumber == request.LineNumber).ToListAsync();
            if (!linePCs.Any()) return NotFound(new { message = "No MCs found in this line" });
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
            return Ok(new { success = true, message = $"Delete command sent to {linePCs.Count} MCs", cancelledCommands = commandsToCancel.Count, removedEntries = modelEntries.Count });
        }

[HttpGet("serve-download/{requestId}")]
        public ActionResult ServeDownload(string requestId)
        {
            if (!_downloadRequests.TryGetValue(requestId, out var status) || status.Status != "Ready" || !System.IO.File.Exists(status.FilePath))
            {
                return NotFound("File not ready or expired");
            }
            return PhysicalFile(status.FilePath, "application/zip", status.FileName);
        }

        [HttpPost("request-download")]
        public async Task<ActionResult> RequestDownloadFromPC([FromBody] DownloadFromPCRequest request)
        {
            try
            {
                var requestId = Guid.NewGuid().ToString();
                var baseUrl = GetBaseUrl();
                var uploadUrl = $"{baseUrl}/api/ModelLibrary/receive-upload/{requestId}";

                var command = new AgentCommand
                {
                    MCId = request.MCId,
                    CommandType = "UploadModelToLib",
                    CommandData = JsonConvert.SerializeObject(new
                    {
                        ModelName = request.ModelName,
                        UploadUrl = uploadUrl
                    }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                _downloadRequests[requestId] = new DownloadRequestStatus { Status = "Pending", CreatedAt = DateTime.Now };

                return Ok(new { requestId, status = "Pending" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting download from PC");
                return StatusCode(500, new { error = "Failed to request download" });
            }
        }

        [HttpPost("receive-upload/{requestId}")]
        [RequestSizeLimit(500 * 1024 * 1024)] 
        public async Task<ActionResult> ReceiveUploadFromAgent(string requestId, [FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0) return BadRequest("No file uploaded");
                if (!_downloadRequests.ContainsKey(requestId)) return NotFound("Invalid Request ID");

                var tempPath = Path.Combine(Path.GetTempPath(), "FactoryDownloads");
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

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error receiving agent upload");
                _downloadRequests[requestId] = new DownloadRequestStatus { Status = "Failed", Error = ex.Message, CreatedAt = DateTime.Now };
                return StatusCode(500, "Upload failed");
            }
        }

        [HttpGet("check-status/{requestId}")]
        public ActionResult CheckDownloadStatus(string requestId)
        {
            if (!_downloadRequests.TryGetValue(requestId, out var status))
            {
                return NotFound(new { error = "Request not found" });
            }
            return Ok(new { status = status.Status, error = status.Error });
        }

        [HttpGet("{id}/versions")]
        public async Task<ActionResult<IEnumerable<object>>> GetModelVersions(int id)
        {
            var versions = await _context.ModelVersions
                .Where(v => v.ModelFileId == id)
                .OrderByDescending(v => v.VersionNumber)
                .Select(v => new
                {
                    v.ModelVersionId,
                    v.VersionNumber,
                    v.CreatedDate,
                    v.CreatedBy,
                    v.ChangeSummary,
                    Size = v.FileSize
                })
                .ToListAsync();

            return Ok(versions);
        }

        [HttpPost("{id}/revert/{versionId}")]
        public async Task<IActionResult> RevertModelVersion(int id, int versionId)
        {
            try
            {
                var model = await _context.ModelFiles.FindAsync(id);
                if (model == null) return NotFound(new { error = "Model not found" });

                var targetVersion = await _context.ModelVersions
                    .FirstOrDefaultAsync(v => v.ModelVersionId == versionId && v.ModelFileId == id);

                if (targetVersion == null) return NotFound(new { error = "Version not found" });

                model.StoragePath = targetVersion.StoragePath;
                model.Checksum = targetVersion.Checksum;
                model.ContentHash = targetVersion.Checksum;
                model.FileSize = targetVersion.FileSize;
                model.UploadedDate = DateTime.Now; 

                var lastVerNum = await _context.ModelVersions
                    .Where(v => v.ModelFileId == id)
                    .MaxAsync(v => (int?)v.VersionNumber) ?? 0;

                var newVersion = new ModelVersion
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

                _context.ModelVersions.Add(newVersion);

                var logEntry = new SystemLog
                {
                    Timestamp = DateTime.Now,
                    ActionType = "Info",
                    Action = "ModelLibrary Revert",
                    Details = $"Reverted model {model.ModelName} to version {targetVersion.VersionNumber} (v{newVersion.VersionNumber})\n[ModelID:{id}]"
                };
                _context.SystemLogs.Add(logEntry);

                await _context.SaveChangesAsync();

                return Ok(new { success = true, newVersion = newVersion.VersionNumber });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reverting model {id} to version {versionId}");
                return StatusCode(500, new { error = "Revert failed" });
            }
        }
    }
}

