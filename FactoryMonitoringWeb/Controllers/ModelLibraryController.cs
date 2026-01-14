using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ModelLibraryController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<ModelLibraryController> _logger;
        private readonly IHttpContextAccessor _httpContextAccessor;

        // Static dictionary to track download requests (Prototype only - use Redis/Db in prod)
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

        // GET: api/ModelLibrary
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetLibraryModels()
        {
            try
            {
                var models = await _context.ModelFiles
                    .Where(m => m.IsTemplate && m.IsActive)
                    .OrderByDescending(m => m.UploadedDate)
                    .Select(m => new
                    {
                        m.ModelFileId,
                        m.ModelName,
                        m.FileName,
                        m.FileSize,
                        m.Description,
                        m.Category,
                        m.UploadedDate,
                        m.UploadedBy
                    })
                    .ToListAsync();

                return Ok(models);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving model library");
                return StatusCode(500, new { error = "Failed to retrieve models" });
            }
        }

        // GET: api/ModelLibrary/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetModel(int id)
        {
            try
            {
                var model = await _context.ModelFiles
                    .Where(m => m.ModelFileId == id && m.IsTemplate)
                    .Select(m => new
                    {
                        m.ModelFileId,
                        m.ModelName,
                        m.FileName,
                        m.FileSize,
                        m.Description,
                        m.Category,
                        m.UploadedDate,
                        m.UploadedBy
                    })
                    .FirstOrDefaultAsync();

                if (model == null)
                {
                    return NotFound(new { error = "Model not found" });
                }

                return Ok(model);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving model {id}");
                return StatusCode(500, new { error = "Failed to retrieve model" });
            }
        }

        // POST: api/ModelLibrary/upload
        [HttpPost("upload")]
        public async Task<ActionResult<object>> UploadModel([FromForm] IFormFile file, [FromForm] string modelName, [FromForm] string? description, [FromForm] string? category)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "No file uploaded" });
                }

                if (string.IsNullOrWhiteSpace(modelName))
                {
                    modelName = Path.GetFileNameWithoutExtension(file.FileName);
                }

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
                    IsTemplate = true,  // This is a library template
                    Description = description,
                    Category = category
                };

                _context.ModelFiles.Add(modelFile);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    success = true,
                    message = "Model uploaded to library successfully",
                    modelFileId = modelFile.ModelFileId,
                    modelName = modelFile.ModelName
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading model to library");
                return StatusCode(500, new { error = $"Upload failed: {ex.Message}" });
            }
        }

        // POST: api/ModelLibrary/apply
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
                    if (modelFile == null)
                    {
                        return NotFound(new { error = "Model not found in library" });
                    }
                    targetModelName = modelFile.ModelName;
                }
                else if (!string.IsNullOrEmpty(request.ModelName))
                {
                    // Local-only mode
                    targetModelName = request.ModelName;
                }
                else
                {
                    return BadRequest(new { error = "Either ModelFileId or ModelName must be provided" });
                }

                // Build query for target PCs
                var query = _context.FactoryPCs.AsQueryable();

                if (request.TargetType == "version" && !string.IsNullOrWhiteSpace(request.Version))
                {
                    query = query.Where(p => p.ModelVersion == request.Version);
                }
                else if (request.TargetType == "line" && request.LineNumber.HasValue)
                {
                    query = query.Where(p => p.LineNumber == request.LineNumber.Value);
                }
                else if (request.TargetType == "lineandversion" && request.LineNumber.HasValue && !string.IsNullOrWhiteSpace(request.Version))
                {
                    query = query.Where(p => p.LineNumber == request.LineNumber.Value && p.ModelVersion == request.Version);
                }
                else if (request.TargetType == "selected" && request.SelectedPCIds != null && request.SelectedPCIds.Any())
                {
                    query = query.Where(p => request.SelectedPCIds.Contains(p.PCId));
                }
                // If "all", no filter needed

                var targetPCs = await query.ToListAsync();

                if (targetPCs.Count == 0)
                {
                    return BadRequest(new { error = "No PCs match the specified criteria" });
                }

                if (request.CheckOnly)
                {
                   var targetPCIds = targetPCs.Select(p => p.PCId).ToList();
                   var existingModels = await _context.Models
                        .Where(m => targetPCIds.Contains(m.PCId) && m.ModelName == targetModelName)
                        .Select(m => m.PCId)
                        .ToListAsync();

                   return Ok(new
                   {
                       success = true,
                       checks = true,
                       totalTargets = targetPCs.Count,
                       existingCount = existingModels.Count,
                       existingOnPCIds = existingModels
                   });
                }

                // Create download URL only if we have a library file
                var baseUrl = GetBaseUrl();
                string downloadUrl = modelFile != null ? $"{baseUrl}/api/agent-legacy/downloadmodel/{modelFile.ModelFileId}" : null;

                // Create unique commands for each target PC based on availability
                foreach (var pc in targetPCs)
                {
                    // SMART DISTRIBUTION CHECK
                    // Check if this PC already has this model
                    var hasModel = await _context.Models.AnyAsync(m => m.PCId == pc.PCId && m.ModelName == targetModelName);

                    AgentCommand command;

                    if (hasModel && !request.ForceOverwrite)
                    {
                        // Deduplication: Remove any existing pending "ChangeModel" commands for this PC
                        var pendingChangeCmds = await _context.AgentCommands
                            .Where(c => c.PCId == pc.PCId && c.Status == "Pending" && c.CommandType == "ChangeModel")
                            .ToListAsync();
                        if (pendingChangeCmds.Any())
                        {
                            _context.AgentCommands.RemoveRange(pendingChangeCmds);
                        }

                        // PC already has the model, just tell it to switch
                        command = new AgentCommand
                        {
                            PCId = pc.PCId,
                            CommandType = "ChangeModel",
                            CommandData = JsonConvert.SerializeObject(new
                            {
                                ModelName = targetModelName
                            }),
                            Status = "Pending",
                            CreatedDate = DateTime.Now
                        };
                    }
                    else
                    {
                        if (modelFile == null)
                        {
                            // We are in Local Only mode, but PC doesn't have the model. We can't upload it!
                            // This shouldn't happen if frontend checks compliance, but safe to skip or error.
                            continue; 
                        }

                        // Deduplication: Remove any existing pending "UploadModel" or "ChangeModel" commands for this PC
                        // (If we are uploading, we supersede both upload and change requests)
                        var pendingCmds = await _context.AgentCommands
                            .Where(c => c.PCId == pc.PCId && c.Status == "Pending" && 
                                   (c.CommandType == "UploadModel" || c.CommandType == "ChangeModel"))
                            .ToListAsync();
                        if (pendingCmds.Any())
                        {
                            _context.AgentCommands.RemoveRange(pendingCmds);
                        }

                        // PC needs the model, upload it
                        command = new AgentCommand
                        {
                            PCId = pc.PCId,
                            CommandType = "UploadModel",
                            CommandData = JsonConvert.SerializeObject(new
                            {
                                ModelFileId = modelFile.ModelFileId,
                                ModelName = modelFile.ModelName,
                                FileName = modelFile.FileName,
                                DownloadUrl = downloadUrl,
                                ApplyOnUpload = request.ApplyImmediately
                            }),
                            Status = "Pending",
                            CreatedDate = DateTime.Now
                        };
                    }

                    _context.AgentCommands.Add(command);
                }

                // Get distinct line numbers and versions from the target PCs
                var affectedLinesAndVersions = targetPCs
                    .GroupBy(p => new { p.LineNumber, p.ModelVersion })
                    .Select(g => g.Key)
                    .ToList();
                
                foreach (var item in affectedLinesAndVersions)
                {
                    // targetModelName is already defined in the outer scope (line 156)
                    var lineTarget = await _context.LineTargetModels
                        .FirstOrDefaultAsync(ltm => ltm.LineNumber == item.LineNumber && ltm.ModelVersion == item.ModelVersion);
                    
                    if (lineTarget != null)
                    {
                        // Update existing target
                        lineTarget.TargetModelName = targetModelName;
                        lineTarget.LastUpdated = DateTime.Now;
                        lineTarget.Notes = $"Updated via {request.TargetType} deployment at {DateTime.Now:yyyy-MM-dd HH:mm:ss}";
                    }
                    else
                    {
                        // Create new target
                        _context.LineTargetModels.Add(new LineTargetModel
                        {
                            LineNumber = item.LineNumber,
                            ModelVersion = item.ModelVersion,
                            TargetModelName = targetModelName,
                            SetByUser = "System",
                            SetDate = DateTime.Now,
                            LastUpdated = DateTime.Now,
                            Notes = $"Set via {request.TargetType} deployment at {DateTime.Now:yyyy-MM-dd HH:mm:ss}"
                        });
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    success = true,
                    message = $"Model deployment initiated for {targetPCs.Count} PC(s) ({(request.ForceOverwrite ? "Overwrite" : "Smart Dist.")})",
                    affectedPCs = targetPCs.Count,
                    targets = targetPCs.Select(p => new
                    {
                        pcId = p.PCId,
                        name = $"Line {p.LineNumber} - PC {p.PCNumber}",
                        version = p.ModelVersion
                    })
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying model to targets");
                return StatusCode(500, new { error = $"Apply failed: {ex.Message}" });
            }
        }

        // GET: api/ModelLibrary/line-available/{lineNumber}?version=3.5
        [HttpGet("line-available/{lineNumber}")]
        public async Task<ActionResult<IEnumerable<object>>> GetLineAvailableModels(int lineNumber, [FromQuery] string? version)
        {
            try
            {
                // 1. Get all PCs in this line (filtered by version if provided)
                var query = _context.FactoryPCs.Where(p => p.LineNumber == lineNumber);
                if (!string.IsNullOrEmpty(version))
                {
                    query = query.Where(p => p.ModelVersion == version);
                }
                
                var linePCs = await query
                    .Select(p => p.PCId)
                    .ToListAsync();
                
                int totalPCs = linePCs.Count;
                
                if (totalPCs == 0) return Ok(new List<object>());

                // 2. Get all Library models
                var libraryModels = await _context.ModelFiles
                    .Where(m => m.IsTemplate && m.IsActive)
                    .Select(m => new { m.ModelName, m.ModelFileId })
                    .ToListAsync();

                // 3. Get all On-PC models for this line
                var onPcModels = await _context.Models
                    .Where(m => linePCs.Contains(m.PCId))
                    .Select(m => new { m.ModelName, m.PCId })
                    .ToListAsync();

                // 4. Aggregate unique model names
                var allModelNames = libraryModels.Select(m => m.ModelName)
                    .Union(onPcModels.Select(m => m.ModelName))
                    .Distinct()
                    .OrderBy(n => n)
                    .ToList();

                var result = new List<object>();

                foreach (var name in allModelNames)
                {
                    var libModel = libraryModels.FirstOrDefault(m => m.ModelName == name);
                    var pcIdsWithModel = onPcModels.Where(m => m.ModelName == name).Select(m => m.PCId).Distinct().ToList();
                    
                    result.Add(new
                    {
                        ModelName = name,
                        ModelFileId = libModel?.ModelFileId, // Null if not in library
                        InLibrary = libModel != null,
                        AvailableOnPCIds = pcIdsWithModel,
                        TotalPCsInLine = totalPCs,
                        ComplianceCount = pcIdsWithModel.Count,
                        ComplianceText = $"{pcIdsWithModel.Count}/{totalPCs} Units"
                    });
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting available models for line {lineNumber}");
                return StatusCode(500, new { error = "Failed to retrieve line models" });
            }
        }

        // DELETE: api/ModelLibrary/{id}
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteModel(int id)
        {
            try
            {
                var model = await _context.ModelFiles.FindAsync(id);
                if (model == null || !model.IsTemplate)
                {
                    return NotFound(new { error = "Model not found in library" });
                }

                // Hard Delete - Remove related distributions first, then the file
                var distributions = await _context.ModelDistributions
                    .Where(d => d.ModelFileId == id)
                    .ToListAsync();
                
                if (distributions.Any())
                {
                    _context.ModelDistributions.RemoveRange(distributions);
                }

                _context.ModelFiles.Remove(model);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Model permanently deleted from library" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error deleting model {id}");
                return StatusCode(500, new { error = "Delete failed" });
            }
        }

        // GET: api/ModelLibrary/download/{id}
        [HttpGet("download/{id}")]
        public async Task<IActionResult> DownloadModel(int id)
        {
            try
            {
                var model = await _context.ModelFiles.FindAsync(id);
                if (model == null || !model.IsTemplate)
                {
                    return NotFound();
                }

                return File(model.FileData, "application/zip", model.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading model {id}");
                return StatusCode(500);
            }
        }
        [HttpPost("line-delete")]
        public async Task<ActionResult> DeleteLineModel([FromBody] DeleteLineModelRequest request)
        {
            try
            {
                var linePCs = await _context.FactoryPCs
                    .Where(p => p.LineNumber == request.LineNumber)
                    .ToListAsync();

                if (!linePCs.Any()) return NotFound(new { error = "Line not found" });

                // Find PCs that actually have this model
                var pcIds = linePCs.Select(p => p.PCId).ToList();
                var pcsWithModel = await _context.Models
                    .Where(m => pcIds.Contains(m.PCId) && m.ModelName == request.ModelName)
                    .Select(m => m.PCId)
                    .ToListAsync();

                if (!pcsWithModel.Any()) return Ok(new { success = true, message = "Model not found on any PC in this line" });

                foreach (var pcId in pcsWithModel)
                {
                    // Deduplication: Remove any existing pending "DeleteModel" commands for this PC
                    var pendingDeleteCmds = await _context.AgentCommands
                        .Where(c => c.PCId == pcId && c.Status == "Pending" && c.CommandType == "DeleteModel")
                        .ToListAsync();
                    if (pendingDeleteCmds.Any())
                    {
                        _context.AgentCommands.RemoveRange(pendingDeleteCmds);
                    }

                    var command = new AgentCommand
                    {
                        PCId = pcId,
                        CommandType = "DeleteModel",
                        CommandData = JsonConvert.SerializeObject(new { ModelName = request.ModelName }),
                        Status = "Pending",
                        CreatedDate = DateTime.Now
                    };
                    _context.AgentCommands.Add(command);
                }

                await _context.SaveChangesAsync();
                return Ok(new { success = true, message = $"Delete command sent to {pcsWithModel.Count} PCs" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting line model");
                return StatusCode(500, new { error = "Failed to delete line model" });
            }
        }


        // ==========================================
        // AGENT TO SERVER DOWNLOAD FLOW
        // ==========================================

        [HttpPost("request-download")]
        public async Task<ActionResult> RequestDownloadFromPC([FromBody] DownloadFromPCRequest request)
        {
            try
            {
                var requestId = Guid.NewGuid().ToString();
                // Use Relative URL because Agent's HttpClient is already connected to the server and expects a path
                var uploadUrl = $"/api/ModelLibrary/receive-upload/{requestId}";

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

        [HttpGet("serve-download/{requestId}")]
        public ActionResult ServeDownload(string requestId)
        {
            if (!_downloadRequests.TryGetValue(requestId, out var status) || status.Status != "Ready" || !System.IO.File.Exists(status.FilePath))
            {
                return NotFound("File not ready or expired");
            }

            var bytes = System.IO.File.ReadAllBytes(status.FilePath);
            // Cleanup? Maybe keep for a bit. For now, serve it.
            return File(bytes, "application/zip", status.FileName);
        }

    }

    // Models under namespace
    public class DownloadRequestStatus 
    {
        public string Status { get; set; } // Pending, Ready, Failed
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
        public string TargetType { get; set; } = "all"; // "all", "version", "line", "lineandversion", "selected"
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

}

