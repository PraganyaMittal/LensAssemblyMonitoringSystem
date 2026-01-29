using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.IO.Compression;
using System.Text;

namespace FactoryMonitoringWeb.Controllers
{
    // ==========================================
    // DTOs & Helper Classes
    // ==========================================

    public class FileChangeLog
    {
        public string Path { get; set; }
        public string ChangeType { get; set; } // "MODIFIED", "ADDED", "DELETED"
        public string OldContent { get; set; }
        public string NewContent { get; set; }
    }

    public class HistoryLogData
    {
        public string Summary { get; set; }
        public List<FileChangeLog> Changes { get; set; }
    }

    public class UpdateFileRequest
    {
        public string Path { get; set; }
        public string Content { get; set; }
    }

    public class BulkUpdateFileRequest
    {
        public List<UpdateFileRequest> Updates { get; set; }
    }

    public class DownloadRequestStatus
    {
        public string Status { get; set; }
        public string FilePath { get; set; }
        public string FileName { get; set; }
        public string Error { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class DownloadFromPCRequest
    {
        public int PCId { get; set; }
        public string ModelName { get; set; }
    }

    public class ApplyModelRequest
    {
        public int ModelFileId { get; set; }
        public string TargetType { get; set; } = "all";
        public string? Version { get; set; }
        public int? LineNumber { get; set; }
        public List<int>? SelectedPCIds { get; set; }
        public bool ApplyImmediately { get; set; } = true;
        public bool CheckOnly { get; set; } = false;
        public bool ForceOverwrite { get; set; } = false;
        public string? ModelName { get; set; }
    }

    public class DeleteLineModelRequest
    {
        public int LineNumber { get; set; }
        public string ModelName { get; set; }
    }

    // ==========================================
    // CONTROLLER
    // ==========================================
    [Route("api/[controller]")]
    [ApiController]
    public class ModelLibraryController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<ModelLibraryController> _logger;
        private readonly IHttpContextAccessor _httpContextAccessor;

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus> _downloadRequests
            = new System.Collections.Concurrent.ConcurrentDictionary<string, DownloadRequestStatus>();

        public ModelLibraryController(FactoryDbContext context, ILogger<ModelLibraryController> logger, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _logger = logger;
            _httpContextAccessor = httpContextAccessor;
        }

        private string GetBaseUrl()
        {
            var request = _httpContextAccessor.HttpContext.Request;
            return $"{request.Scheme}://{request.Host}";
        }

        // ==========================================
        // NEW: BULK SAVE WITH STRUCTURED LOGGING
        // ==========================================
        [HttpPost("{id}/save-files")]
        public async Task<IActionResult> SaveModelFiles(int id, [FromBody] BulkUpdateFileRequest request)
        {
            try
            {
                if (request.Updates == null || !request.Updates.Any())
                    return Ok(new { success = true, message = "No changes to save." });

                var model = await _context.ModelFiles.FirstOrDefaultAsync(m => m.ModelFileId == id);
                if (model == null) return NotFound(new { error = "Model not found" });

                // Prepare structured history data
                var historyData = new HistoryLogData
                {
                    Summary = $"Updated {request.Updates.Count} file(s) via Editor",
                    Changes = new List<FileChangeLog>()
                };

                using (var ms = new MemoryStream())
                {
                    await ms.WriteAsync(model.FileData, 0, model.FileData.Length);
                    ms.Position = 0;

                    using (var archive = new ZipArchive(ms, ZipArchiveMode.Update, true))
                    {
                        foreach (var update in request.Updates)
                        {
                            // Robust lookup: iterate to match normalized path, ignoring leading slashes
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

                            // Only record if content actually changed
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
                    model.FileData = ms.ToArray();
                }

                model.UploadedDate = DateTime.Now;

                // Serialize history to JSON
                var jsonDetails = JsonConvert.SerializeObject(historyData);

                // FIX: Map to correct SystemLog properties
                var logEntry = new SystemLog
                {
                    Timestamp = DateTime.Now,
                    ActionType = "Info",                // Replaces 'Level'
                    Action = "ModelLibrary Update",     // Replaces 'Source'
                    // Store structured data in Details, append ModelID for filtering since no custom column exists
                    Details = jsonDetails + $"\n[ModelID:{id}]"
                };

                _context.SystemLogs.Add(logEntry);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, count = request.Updates.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error bulk saving files in model {id}");
                return StatusCode(500, new { error = "Failed to save files: " + ex.Message });
            }
        }

        // ==========================================
        // NEW: GET CHANGE HISTORY
        // ==========================================
        [HttpGet("{id}/history")]
        public async Task<ActionResult<IEnumerable<object>>> GetModelHistory(int id)
        {
            try
            {
                // FIX: Query using correct properties and ID tag
                var history = await _context.SystemLogs
                    .Where(l => l.Action == "ModelLibrary Update" && l.Details.Contains($"[ModelID:{id}]"))
                    .OrderByDescending(l => l.Timestamp)
                    .Select(l => new
                    {
                        l.LogId,
                        l.Timestamp,
                        // Return 'Details' as 'details' for the frontend
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

        // ==========================================
        // NEW: GET STRUCTURE & CONTENT (Unchanged)
        // ==========================================
        [HttpGet("{id}/structure")]
        public async Task<ActionResult<IEnumerable<object>>> GetModelStructure(int id)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id)
                    .Select(m => new { m.FileData })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound(new { error = "Model not found" });

                using var ms = new MemoryStream(model.FileData);
                using var archive = new ZipArchive(ms, ZipArchiveMode.Read);

                var entries = archive.Entries.Select(e => new
                {
                    Path = e.FullName.Replace('\\', '/'),
                    Size = e.Length,
                    IsDirectory = string.IsNullOrEmpty(e.Name) || e.FullName.Replace('\\', '/').EndsWith("/")
                }).OrderBy(e => e.Path).ToList();

                return Ok(entries);
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
                    .Select(m => new { m.FileData })
                    .FirstOrDefaultAsync();

                if (model == null) return NotFound();

                using var ms = new MemoryStream(model.FileData);
                using var archive = new ZipArchive(ms, ZipArchiveMode.Read);

                // Robust lookup: iterate to match normalized path, ignoring leading slashes
                var entry = archive.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/').TrimStart('/') == path.TrimStart('/'));
                if (entry == null) return NotFound(new { error = "File not found in archive" });

                var ext = Path.GetExtension(entry.Name).ToLower();
                var allowedExtensions = new[] { ".json", ".xml", ".txt", ".ini", ".conf", ".config", ".py", ".js", ".md", ".csv", ".log" };

                if (!allowedExtensions.Contains(ext))
                    return BadRequest(new { error = "Binary file viewing not supported" });

                using var stream = entry.Open();
                using var reader = new StreamReader(stream);
                string content = await reader.ReadToEndAsync();

                return Ok(new { content });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reading file {path} from model {id}");
                return StatusCode(500, new { error = "Failed to read file content" });
            }
        }

        // ==========================================
        // EXISTING ENDPOINTS (Apply, Upload, Download, etc.)
        // ==========================================

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
        public async Task<ActionResult<object>> UploadModel([FromForm] IFormFile file, [FromForm] string modelName, [FromForm] string? description, [FromForm] string? category)
        {
            if (file == null || file.Length == 0) return BadRequest(new { error = "No file uploaded" });
            if (string.IsNullOrWhiteSpace(modelName)) modelName = Path.GetFileNameWithoutExtension(file.FileName);

            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);

            var modelFile = new ModelFile
            {
                ModelName = modelName,
                FileName = file.FileName,
                FileData = memoryStream.ToArray(),
                FileSize = file.Length,
                UploadedDate = DateTime.Now,
                IsActive = true,
                IsTemplate = true,
                Description = description,
                Category = category
            };

            _context.ModelFiles.Add(modelFile);
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Model uploaded successfully", modelFileId = modelFile.ModelFileId, modelName = modelFile.ModelName });
        }

        [HttpPost("apply")]
        public async Task<ActionResult<object>> ApplyModelToTargets([FromBody] ApplyModelRequest request)
        {
            try
            {
                string targetModelName = null;
                ModelFile modelFile = null;

                if (request.ModelFileId > 0)
                {
                    modelFile = await _context.ModelFiles.FindAsync(request.ModelFileId);
                    if (modelFile == null) return NotFound(new { error = "Model not found in library" });
                    targetModelName = modelFile.ModelName;
                }
                else if (!string.IsNullOrEmpty(request.ModelName)) targetModelName = request.ModelName;
                else return BadRequest(new { error = "Either ModelFileId or ModelName must be provided" });

                var query = _context.FactoryPCs.AsQueryable();
                if (request.TargetType == "version" && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.ModelVersion == request.Version);
                else if (request.TargetType == "line" && request.LineNumber.HasValue) query = query.Where(p => p.LineNumber == request.LineNumber.Value);
                else if (request.TargetType == "lineandversion" && request.LineNumber.HasValue && !string.IsNullOrWhiteSpace(request.Version)) query = query.Where(p => p.LineNumber == request.LineNumber.Value && p.ModelVersion == request.Version);
                else if (request.TargetType == "selected" && request.SelectedPCIds != null) query = query.Where(p => request.SelectedPCIds.Contains(p.PCId));

                var targetPCs = await query.ToListAsync();
                if (targetPCs.Count == 0) return BadRequest(new { error = "No PCs match the specified criteria" });

                if (request.CheckOnly)
                {
                    var targetPCIds = targetPCs.Select(p => p.PCId).ToList();
                    var existingModels = await _context.Models.Where(m => targetPCIds.Contains(m.PCId) && m.ModelName == targetModelName).Select(m => m.PCId).ToListAsync();
                    return Ok(new { success = true, checks = true, totalTargets = targetPCs.Count, existingCount = existingModels.Count, existingOnPCIds = existingModels });
                }

                var baseUrl = GetBaseUrl();
                string downloadUrl = modelFile != null ? $"{baseUrl}/api/agent-legacy/downloadmodel/{modelFile.ModelFileId}" : null;

                foreach (var pc in targetPCs)
                {
                    var hasModel = await _context.Models.AnyAsync(m => m.PCId == pc.PCId && m.ModelName == targetModelName);
                    AgentCommand command;

                    if (hasModel && !request.ForceOverwrite)
                    {
                        var pending = await _context.AgentCommands.Where(c => c.PCId == pc.PCId && c.Status == "Pending" && c.CommandType == "ChangeModel").ToListAsync();
                        if (pending.Any()) _context.AgentCommands.RemoveRange(pending);
                        command = new AgentCommand { PCId = pc.PCId, CommandType = "ChangeModel", CommandData = JsonConvert.SerializeObject(new { ModelName = targetModelName }), Status = "Pending", CreatedDate = DateTime.Now };
                    }
                    else
                    {
                        if (modelFile == null) continue;
                        var pending = await _context.AgentCommands.Where(c => c.PCId == pc.PCId && c.Status == "Pending" && (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel")).ToListAsync();
                        if (pending.Any()) _context.AgentCommands.RemoveRange(pending);
                        command = new AgentCommand { PCId = pc.PCId, CommandType = "UploadModel", CommandData = JsonConvert.SerializeObject(new { ModelFileId = modelFile.ModelFileId, ModelName = modelFile.ModelName, FileName = modelFile.FileName, DownloadUrl = downloadUrl, ApplyOnUpload = request.ApplyImmediately }), Status = "Pending", CreatedDate = DateTime.Now };
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
            // (Keeping existing logic for brevity - it was correct in previous version)
            var query = _context.FactoryPCs.Where(p => p.LineNumber == lineNumber);
            if (!string.IsNullOrEmpty(version)) query = query.Where(p => p.ModelVersion == version);
            var linePCs = await query.Select(p => p.PCId).ToListAsync();
            int totalPCs = linePCs.Count;
            if (totalPCs == 0) return Ok(new List<object>());

            var libraryModels = await _context.ModelFiles.Where(m => m.IsTemplate && m.IsActive).Select(m => new { m.ModelName, m.ModelFileId }).ToListAsync();
            var onPcModels = await _context.Models.Where(m => linePCs.Contains(m.PCId)).Select(m => new { m.ModelName, m.PCId }).ToListAsync();

            var allNames = libraryModels.Select(m => m.ModelName).Union(onPcModels.Select(m => m.ModelName)).Distinct().OrderBy(n => n).ToList();
            var result = allNames.Select(name => new {
                ModelName = name,
                ModelFileId = libraryModels.FirstOrDefault(m => m.ModelName == name)?.ModelFileId,
                InLibrary = libraryModels.Any(m => m.ModelName == name),
                AvailableOnPCIds = onPcModels.Where(m => m.ModelName == name).Select(m => m.PCId).Distinct().ToList(),
                TotalPCsInLine = totalPCs
            });
            return Ok(result);
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();
            var dist = await _context.ModelDistributions.Where(d => d.ModelFileId == id).ToListAsync();
            if (dist.Any()) _context.ModelDistributions.RemoveRange(dist);
            _context.ModelFiles.Remove(model);
            await _context.SaveChangesAsync();
            return Ok(new { success = true });
        }

        [HttpGet("download/{id}")]
        public async Task<IActionResult> DownloadModel(int id)
        {
            var model = await _context.ModelFiles.FindAsync(id);
            if (model == null) return NotFound();
            return File(model.FileData, "application/zip", model.FileName);
        }

        [HttpPost("line-delete")]
        public async Task<ActionResult> DeleteLineModel([FromBody] DeleteLineModelRequest request)
        {
            var linePCs = await _context.FactoryPCs.Where(p => p.LineNumber == request.LineNumber).ToListAsync();
            if (!linePCs.Any()) return NotFound();
            var pcIds = linePCs.Select(p => p.PCId).ToList();
            var pcsWithModel = await _context.Models.Where(m => pcIds.Contains(m.PCId) && m.ModelName == request.ModelName).Select(m => m.PCId).ToListAsync();

            foreach (var pcId in pcsWithModel)
            {
                _context.AgentCommands.Add(new AgentCommand { PCId = pcId, CommandType = "DeleteModel", CommandData = JsonConvert.SerializeObject(new { ModelName = request.ModelName }), Status = "Pending", CreatedDate = DateTime.Now });
            }
            await _context.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // ... (Agent endpoints unchanged)
    


// ==========================================
// AGENT DOWNLOAD FLOW
// ==========================================
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
                    PCId = request.PCId,
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
        [RequestSizeLimit(500 * 1024 * 1024)] // 500MB limit
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
    }
}