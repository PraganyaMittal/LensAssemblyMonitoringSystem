using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Controllers
{
    // ── Request DTOs ──────────────────────────────────────

    public class SaveModelRequest
    {
        public string ModelName { get; set; } = default!;
        public string? Description { get; set; }
        public int? BaseModelFileId { get; set; }
        public BarrelConfigDto BarrelConfig { get; set; } = default!;
        public List<PickerConfigDto> PickerConfigs { get; set; } = new();
    }

    public class BarrelConfigDto
    {
        public int LensCount { get; set; }
        public int SpacerCount { get; set; }
        public string[]? AssemblySequence { get; set; }
        public decimal? TTL { get; set; }
        public decimal? StepHeight { get; set; }
        public decimal? LensHeight { get; set; }
        public decimal? SpacerHeight { get; set; }
        public int? TrayDimX { get; set; }
        public int? TrayDimY { get; set; }
        public int MachineCount { get; set; }
    }

    public class PickerConfigDto
    {
        public int McNumber { get; set; }
        public bool Picker1Enabled { get; set; } = true;
        public string? Picker1Type { get; set; }
        public string? Picker1Position { get; set; }
        public object? Picker1Params { get; set; }
        public bool Picker2Enabled { get; set; }
        public string? Picker2Type { get; set; }
        public string? Picker2Position { get; set; }
        public object? Picker2Params { get; set; }
    }

    public class SetDefaultModelRequest
    {
        public int ModelFileId { get; set; }
    }

    // ── Controller ────────────────────────────────────────

    [Route("api/[controller]")]
    [ApiController]
    public class ModelManagementController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<ModelManagementController> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        public ModelManagementController(
            LensAssemblyDbContext context,
            ILogger<ModelManagementController> logger,
            IHubContext<AgentHub> hubContext)
        {
            _context = context;
            _logger = logger;
            _hubContext = hubContext;
        }

        /// <summary>
        /// Get all lines for a generation, with model counts.
        /// GET /api/ModelManagement/lines/{version}
        /// </summary>
        [HttpGet("lines/{version}")]
        public async Task<ActionResult> GetLines(string version)
        {
            try
            {
                // Get all lines that have machines in this generation
                var lines = await _context.LensAssemblyMCs
                    .Where(mc => mc.ModelVersion == version)
                    .GroupBy(mc => mc.LineNumber)
                    .Select(g => new
                    {
                        LineNumber = g.Key,
                        MachineCount = g.Count(),
                        OnlineCount = g.Count(mc => mc.IsOnline),
                    })
                    .OrderBy(l => l.LineNumber)
                    .ToListAsync();

                // Get model counts per line from barrel config
                var modelCounts = await _context.LineBarrelConfigs
                    .Where(bc => bc.Version == version)
                    .GroupBy(bc => bc.LineNumber)
                    .Select(g => new
                    {
                        LineNumber = g.Key,
                        ModelCount = g.Count()
                    })
                    .ToListAsync();

                // Check if default model exists
                var hasDefault = await _context.ModelFiles
                    .AnyAsync(m => m.IsActive && m.IsDefaultTemplate);

                var result = lines.Select(l => new
                {
                    l.LineNumber,
                    l.MachineCount,
                    l.OnlineCount,
                    ModelCount = modelCounts.FirstOrDefault(mc => mc.LineNumber == l.LineNumber)?.ModelCount ?? 0,
                    HasDefaultModel = hasDefault
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting lines for version {Version}", version);
                return StatusCode(500, new { error = "Failed to get lines" });
            }
        }

        /// <summary>
        /// Get all models for a specific line.
        /// GET /api/ModelManagement/line/{lineNumber}/models?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models")]
        public async Task<ActionResult> GetLineModels(int lineNumber, [FromQuery] string? version)
        {
            try
            {
                var query = _context.LineBarrelConfigs.AsQueryable();
                query = query.Where(bc => bc.LineNumber == lineNumber);
                if (!string.IsNullOrEmpty(version))
                    query = query.Where(bc => bc.Version == version);

                var barrelConfigs = await query
                    .OrderByDescending(bc => bc.ModifiedDate)
                    .ToListAsync();

                // Get last sync per model
                var modelNames = barrelConfigs.Select(bc => bc.ModelName).ToList();
                var lastSyncs = await _context.ModelSyncHistories
                    .Where(s => s.LineNumber == lineNumber && modelNames.Contains(s.ModelName))
                    .GroupBy(s => s.ModelName)
                    .Select(g => new
                    {
                        ModelName = g.Key,
                        LastSync = g.OrderByDescending(s => s.SyncedDate).FirstOrDefault()
                    })
                    .ToListAsync();

                // Get last deployment per model
                var lastDeploys = await _context.LineDeploymentHistories
                    .Where(d => d.LineNumber == lineNumber && modelNames.Contains(d.ModelName))
                    .GroupBy(d => d.ModelName)
                    .Select(g => new
                    {
                        ModelName = g.Key,
                        LastDeploy = g.OrderByDescending(d => d.DeployedDate).FirstOrDefault()
                    })
                    .ToListAsync();

                // Get picker config counts per model
                var pickerCounts = await _context.MachinePickerConfigs
                    .Where(pc => pc.LineNumber == lineNumber && modelNames.Contains(pc.ModelName))
                    .GroupBy(pc => pc.ModelName)
                    .Select(g => new
                    {
                        ModelName = g.Key,
                        MachineCount = g.Select(pc => pc.McNumber).Distinct().Count()
                    })
                    .ToListAsync();

                // Get machine count for this line
                var totalMachines = await _context.LensAssemblyMCs
                    .Where(mc => mc.LineNumber == lineNumber && (string.IsNullOrEmpty(version) || mc.ModelVersion == version))
                    .CountAsync();

                var result = barrelConfigs.Select(bc =>
                {
                    var sync = lastSyncs.FirstOrDefault(s => s.ModelName == bc.ModelName)?.LastSync;
                    var deploy = lastDeploys.FirstOrDefault(d => d.ModelName == bc.ModelName)?.LastDeploy;
                    var mcCount = pickerCounts.FirstOrDefault(p => p.ModelName == bc.ModelName)?.MachineCount ?? 0;

                    return new
                    {
                        bc.ModelName,
                        bc.LensCount,
                        bc.SpacerCount,
                        bc.AssemblySequence,
                        bc.TTL,
                        bc.StepHeight,
                        bc.LensHeight,
                        bc.SpacerHeight,
                        bc.TrayDimX,
                        bc.TrayDimY,
                        bc.MachineCount,
                        bc.Version,
                        bc.CreatedDate,
                        bc.ModifiedDate,
                        ConfiguredMachines = mcCount,
                        TotalMachines = totalMachines,
                        LastSyncDate = sync?.SyncedDate,
                        LastSyncStatus = sync?.Status,
                        LastDeployDate = deploy?.DeployedDate,
                        LastDeployStatus = deploy?.Status,
                    };
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting models for line {LineNumber}", lineNumber);
                return StatusCode(500, new { error = "Failed to get line models" });
            }
        }

        /// <summary>
        /// Save a new model (barrel config + picker configs) for a line.
        /// POST /api/ModelManagement/line/{lineNumber}/models?version=3.5
        /// </summary>
        [HttpPost("line/{lineNumber}/models")]
        public async Task<ActionResult> SaveModel(int lineNumber, [FromQuery] string version, [FromBody] SaveModelRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.ModelName))
                    return BadRequest(new { error = "Model name is required" });

                version = version ?? "3.5";

                // Check if model already exists (overwrite scenario)
                var existing = await _context.LineBarrelConfigs
                    .FirstOrDefaultAsync(bc => bc.LineNumber == lineNumber && bc.Version == version && bc.ModelName == request.ModelName);

                if (existing != null)
                {
                    // Overwrite barrel config
                    existing.LensCount = request.BarrelConfig.LensCount;
                    existing.SpacerCount = request.BarrelConfig.SpacerCount;
                    existing.AssemblySequence = request.BarrelConfig.AssemblySequence != null
                        ? JsonConvert.SerializeObject(request.BarrelConfig.AssemblySequence) : null;
                    existing.TTL = request.BarrelConfig.TTL;
                    existing.StepHeight = request.BarrelConfig.StepHeight;
                    existing.LensHeight = request.BarrelConfig.LensHeight;
                    existing.SpacerHeight = request.BarrelConfig.SpacerHeight;
                    existing.TrayDimX = request.BarrelConfig.TrayDimX;
                    existing.TrayDimY = request.BarrelConfig.TrayDimY;
                    existing.MachineCount = request.BarrelConfig.MachineCount;
                    existing.ModifiedDate = DateTime.Now;
                }
                else
                {
                    // Create new barrel config
                    var barrelConfig = new LineBarrelConfig
                    {
                        LineNumber = lineNumber,
                        Version = version,
                        ModelName = request.ModelName,
                        LensCount = request.BarrelConfig.LensCount,
                        SpacerCount = request.BarrelConfig.SpacerCount,
                        AssemblySequence = request.BarrelConfig.AssemblySequence != null
                            ? JsonConvert.SerializeObject(request.BarrelConfig.AssemblySequence) : null,
                        TTL = request.BarrelConfig.TTL,
                        StepHeight = request.BarrelConfig.StepHeight,
                        LensHeight = request.BarrelConfig.LensHeight,
                        SpacerHeight = request.BarrelConfig.SpacerHeight,
                        TrayDimX = request.BarrelConfig.TrayDimX,
                        TrayDimY = request.BarrelConfig.TrayDimY,
                        MachineCount = request.BarrelConfig.MachineCount,
                    };
                    _context.LineBarrelConfigs.Add(barrelConfig);
                }

                // Remove old picker configs for this model
                var oldPickers = await _context.MachinePickerConfigs
                    .Where(pc => pc.LineNumber == lineNumber && pc.Version == version && pc.ModelName == request.ModelName)
                    .ToListAsync();
                _context.MachinePickerConfigs.RemoveRange(oldPickers);

                // Add new picker configs
                foreach (var pc in request.PickerConfigs)
                {
                    _context.MachinePickerConfigs.Add(new MachinePickerConfig
                    {
                        LineNumber = lineNumber,
                        Version = version,
                        ModelName = request.ModelName,
                        McNumber = pc.McNumber,
                        Picker1Enabled = pc.Picker1Enabled,
                        Picker1Type = pc.Picker1Type,
                        Picker1Position = pc.Picker1Position,
                        Picker1Params = pc.Picker1Params != null ? JsonConvert.SerializeObject(pc.Picker1Params) : null,
                        Picker2Enabled = pc.Picker2Enabled,
                        Picker2Type = pc.Picker2Type,
                        Picker2Position = pc.Picker2Position,
                        Picker2Params = pc.Picker2Params != null ? JsonConvert.SerializeObject(pc.Picker2Params) : null,
                    });
                }

                await _context.SaveChangesAsync();

                // Create per-machine model file mappings
                // Remove old mappings
                var oldMappings = await _context.LineModelMachineFiles
                    .Where(m => m.LineNumber == lineNumber && m.Version == version && m.ModelName == request.ModelName)
                    .ToListAsync();
                _context.LineModelMachineFiles.RemoveRange(oldMappings);

                // Get the default model file ID (base model)
                var defaultModel = await _context.ModelFiles
                    .Where(m => m.IsActive && m.IsDefaultTemplate)
                    .Select(m => m.ModelFileId)
                    .FirstOrDefaultAsync();

                // Create N machine file entries, all pointing to the same base model
                for (int mc = 1; mc <= request.BarrelConfig.MachineCount; mc++)
                {
                    _context.LineModelMachineFiles.Add(new LineModelMachineFile
                    {
                        LineNumber = lineNumber,
                        Version = version,
                        ModelName = request.ModelName,
                        McNumber = mc,
                        ModelFileId = defaultModel > 0 ? defaultModel : null,
                        Status = "Pending",
                    });
                }

                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = $"Model '{request.ModelName}' saved for Line {lineNumber} with {request.BarrelConfig.MachineCount} machines" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving model for line {LineNumber}", lineNumber);
                return StatusCode(500, new { error = "Failed to save model: " + ex.Message });
            }
        }

        /// <summary>
        /// Get barrel config for a specific model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/barrel-config?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/barrel-config")]
        public async Task<ActionResult> GetBarrelConfig(int lineNumber, string modelName, [FromQuery] string? version)
        {
            var query = _context.LineBarrelConfigs
                .Where(bc => bc.LineNumber == lineNumber && bc.ModelName == modelName);
            if (!string.IsNullOrEmpty(version))
                query = query.Where(bc => bc.Version == version);

            var config = await query.FirstOrDefaultAsync();
            if (config == null) return NotFound(new { error = "Barrel config not found" });

            return Ok(config);
        }

        /// <summary>
        /// Get picker configs for all machines in a model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/picker-config?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/picker-config")]
        public async Task<ActionResult> GetPickerConfig(int lineNumber, string modelName, [FromQuery] string? version)
        {
            var query = _context.MachinePickerConfigs
                .Where(pc => pc.LineNumber == lineNumber && pc.ModelName == modelName);
            if (!string.IsNullOrEmpty(version))
                query = query.Where(pc => pc.Version == version);

            var configs = await query.OrderBy(pc => pc.McNumber).ToListAsync();
            return Ok(configs);
        }

        /// <summary>
        /// Delete a line model and its picker configs.
        /// DELETE /api/ModelManagement/line/{lineNumber}/models/{modelName}?version=3.5
        /// </summary>
        [HttpDelete("line/{lineNumber}/models/{modelName}")]
        public async Task<ActionResult> DeleteLineModel(int lineNumber, string modelName, [FromQuery] string? version)
        {
            try
            {
                var query = _context.LineBarrelConfigs
                    .Where(bc => bc.LineNumber == lineNumber && bc.ModelName == modelName);
                if (!string.IsNullOrEmpty(version))
                    query = query.Where(bc => bc.Version == version);

                var barrel = await query.FirstOrDefaultAsync();
                if (barrel == null)
                    return NotFound(new { error = "Model not found" });

                _context.LineBarrelConfigs.Remove(barrel);

                // Remove picker configs
                var pickers = await _context.MachinePickerConfigs
                    .Where(pc => pc.LineNumber == lineNumber && pc.ModelName == modelName
                        && (string.IsNullOrEmpty(version) || pc.Version == version))
                    .ToListAsync();
                _context.MachinePickerConfigs.RemoveRange(pickers);

                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = $"Model '{modelName}' deleted from Line {lineNumber}" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting model {ModelName} from line {LineNumber}", modelName, lineNumber);
                return StatusCode(500, new { error = "Failed to delete model" });
            }
        }

        /// <summary>
        /// Set a model file as the default template.
        /// POST /api/ModelManagement/default-model
        /// </summary>
        [HttpPost("default-model")]
        public async Task<ActionResult> SetDefaultModel([FromBody] SetDefaultModelRequest request)
        {
            try
            {
                // Clear existing default
                var existingDefaults = await _context.ModelFiles
                    .Where(m => m.IsDefaultTemplate)
                    .ToListAsync();
                foreach (var d in existingDefaults)
                    d.IsDefaultTemplate = false;

                // Set new default
                var model = await _context.ModelFiles.FindAsync(request.ModelFileId);
                if (model == null) return NotFound(new { error = "Model not found" });

                model.IsDefaultTemplate = true;
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = $"'{model.ModelName}' set as default template" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting default model");
                return StatusCode(500, new { error = "Failed to set default model" });
            }
        }

        /// <summary>
        /// Get the current default model template.
        /// GET /api/ModelManagement/default-model
        /// </summary>
        [HttpGet("default-model")]
        public async Task<ActionResult> GetDefaultModel()
        {
            var model = await _context.ModelFiles
                .Where(m => m.IsDefaultTemplate && m.IsActive)
                .Select(m => new { m.ModelFileId, m.ModelName, m.FileName, m.FileSize, m.UploadedDate, m.Description })
                .FirstOrDefaultAsync();

            return Ok(model); // null if no default set
        }

        /// <summary>
        /// Get sync history for a line model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/sync-history?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/sync-history")]
        public async Task<ActionResult> GetSyncHistory(int lineNumber, string modelName, [FromQuery] string? version)
        {
            var query = _context.ModelSyncHistories
                .Where(s => s.LineNumber == lineNumber && s.ModelName == modelName);
            if (!string.IsNullOrEmpty(version))
                query = query.Where(s => s.Version == version);

            var history = await query
                .OrderByDescending(s => s.SyncedDate)
                .Take(20)
                .ToListAsync();

            return Ok(history);
        }

        /// <summary>
        /// Get deployment history for a line.
        /// GET /api/ModelManagement/line/{lineNumber}/deploy-history?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/deploy-history")]
        public async Task<ActionResult> GetDeployHistory(int lineNumber, [FromQuery] string? version)
        {
            var query = _context.LineDeploymentHistories
                .Where(d => d.LineNumber == lineNumber);
            if (!string.IsNullOrEmpty(version))
                query = query.Where(d => d.Version == version);

            var history = await query
                .OrderByDescending(d => d.DeployedDate)
                .Take(50)
                .ToListAsync();

            return Ok(history);
        }
    }
}
