using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Features.Models.Controllers
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
        public string? StepParamsJson { get; set; }
        public string? ComponentParamsJson { get; set; }
        public string? BarrelSlotsJson { get; set; }
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
        [ProducesResponseType(typeof(IEnumerable<ModelManagementLineDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<ModelManagementLineDto>>> GetLines(string version)
        {
            try
            {
                // Get all lines that have machines in this generation
                var lines = await _context.LensAssemblyMCs
                    .Where(mc => mc.GenerationNo == version)
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

                var result = lines.Select(l => new ModelManagementLineDto
                {
                    LineNumber = l.LineNumber,
                    MachineCount = l.MachineCount,
                    OnlineCount = l.OnlineCount,
                    ModelCount = modelCounts.FirstOrDefault(mc => mc.LineNumber == l.LineNumber)?.ModelCount ?? 0,
                    HasDefaultModel = hasDefault
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting lines for version {Version}", version);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to get lines", ErrorCode = "lines_fetch_error" });
            }
        }

        /// <summary>
        /// Get all models for a specific line.
        /// GET /api/ModelManagement/line/{lineNumber}/models?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models")]
        [ProducesResponseType(typeof(IEnumerable<ModelManagementLineModelDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<ModelManagementLineModelDto>>> GetLineModels(int lineNumber, [FromQuery] string? version)
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
                    .Where(mc => mc.LineNumber == lineNumber && (string.IsNullOrEmpty(version) || mc.GenerationNo == version))
                    .CountAsync();

                var result = barrelConfigs.Select(bc =>
                {
                    var sync = lastSyncs.FirstOrDefault(s => s.ModelName == bc.ModelName)?.LastSync;
                    var deploy = lastDeploys.FirstOrDefault(d => d.ModelName == bc.ModelName)?.LastDeploy;
                    var mcCount = pickerCounts.FirstOrDefault(p => p.ModelName == bc.ModelName)?.MachineCount ?? 0;

                    return new ModelManagementLineModelDto
                    {
                        ModelName = bc.ModelName,
                        LensCount = bc.LensCount,
                        SpacerCount = bc.SpacerCount,
                        AssemblySequence = bc.AssemblySequence,
                        TTL = bc.TTL,
                        TrayDimX = bc.TrayDimX,
                        TrayDimY = bc.TrayDimY,
                        MachineCount = bc.MachineCount,
                        StepParamsJson = bc.StepParamsJson,
                        ComponentParamsJson = bc.ComponentParamsJson,
                        BarrelSlotsJson = bc.BarrelSlotsJson,
                        Version = bc.Version,
                        CreatedDate = bc.CreatedDate,
                        ModifiedDate = bc.ModifiedDate,
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
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to get line models", ErrorCode = "line_models_fetch_error" });
            }
        }

        /// <summary>
        /// Save a new model (barrel config + picker configs) for a line.
        /// POST /api/ModelManagement/line/{lineNumber}/models?version=3.5
        /// </summary>
        [HttpPost("line/{lineNumber}/models")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> SaveModel(int lineNumber, [FromQuery] string version, [FromBody] SaveModelRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.ModelName))
                    return BadRequest(new ApiErrorResponse { Message = "Model name is required", ErrorCode = "model_name_required" });

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
                    existing.TrayDimX = request.BarrelConfig.TrayDimX;
                    existing.TrayDimY = request.BarrelConfig.TrayDimY;
                    existing.MachineCount = request.BarrelConfig.MachineCount;
                    existing.StepParamsJson = request.BarrelConfig.StepParamsJson;
                    existing.ComponentParamsJson = request.BarrelConfig.ComponentParamsJson;
                    existing.BarrelSlotsJson = request.BarrelConfig.BarrelSlotsJson;
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
                        TrayDimX = request.BarrelConfig.TrayDimX,
                        TrayDimY = request.BarrelConfig.TrayDimY,
                        MachineCount = request.BarrelConfig.MachineCount,
                        StepParamsJson = request.BarrelConfig.StepParamsJson,
                        ComponentParamsJson = request.BarrelConfig.ComponentParamsJson,
                        BarrelSlotsJson = request.BarrelConfig.BarrelSlotsJson,
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

                return Ok(new BasicResponse { Success = true, Message = $"Model '{request.ModelName}' saved for Line {lineNumber} with {request.BarrelConfig.MachineCount} machines" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving model for line {LineNumber}", lineNumber);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to save model: " + ex.Message, ErrorCode = "model_save_error" });
            }
        }

        /// <summary>
        /// Get barrel config for a specific model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/barrel-config?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/barrel-config")]
        [ProducesResponseType(typeof(LineBarrelConfig), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<LineBarrelConfig>> GetBarrelConfig(int lineNumber, string modelName, [FromQuery] string? version)
        {
            var query = _context.LineBarrelConfigs
                .Where(bc => bc.LineNumber == lineNumber && bc.ModelName == modelName);
            if (!string.IsNullOrEmpty(version))
                query = query.Where(bc => bc.Version == version);

            var config = await query.FirstOrDefaultAsync();
            if (config == null) return NotFound(new ApiErrorResponse { Message = "Barrel config not found", ErrorCode = "barrel_config_not_found" });

            return Ok(config);
        }

        /// <summary>
        /// Get picker configs for all machines in a model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/picker-config?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/picker-config")]
        [ProducesResponseType(typeof(IEnumerable<MachinePickerConfig>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<MachinePickerConfig>>> GetPickerConfig(int lineNumber, string modelName, [FromQuery] string? version)
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
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> DeleteLineModel(int lineNumber, string modelName, [FromQuery] string? version)
        {
            try
            {
                var query = _context.LineBarrelConfigs
                    .Where(bc => bc.LineNumber == lineNumber && bc.ModelName == modelName);
                if (!string.IsNullOrEmpty(version))
                    query = query.Where(bc => bc.Version == version);

                var barrel = await query.FirstOrDefaultAsync();
                if (barrel == null)
                    return NotFound(new ApiErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });

                _context.LineBarrelConfigs.Remove(barrel);

                // Remove picker configs
                var pickers = await _context.MachinePickerConfigs
                    .Where(pc => pc.LineNumber == lineNumber && pc.ModelName == modelName
                        && (string.IsNullOrEmpty(version) || pc.Version == version))
                    .ToListAsync();
                _context.MachinePickerConfigs.RemoveRange(pickers);

                await _context.SaveChangesAsync();

                return Ok(new BasicResponse { Success = true, Message = $"Model '{modelName}' deleted from Line {lineNumber}" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting model {ModelName} from line {LineNumber}", modelName, lineNumber);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to delete model", ErrorCode = "model_delete_error" });
            }
        }

        /// <summary>
        /// Set a model file as the default template.
        /// POST /api/ModelManagement/default-model
        /// </summary>
        [HttpPost("default-model")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> SetDefaultModel([FromBody] SetDefaultModelRequest request)
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
                if (model == null) return NotFound(new ApiErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });

                model.IsDefaultTemplate = true;
                await _context.SaveChangesAsync();

                return Ok(new BasicResponse { Success = true, Message = $"'{model.ModelName}' set as default template" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting default model");
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse { Message = "Failed to set default model", ErrorCode = "default_model_set_error" });
            }
        }

        /// <summary>
        /// Get the current default model template.
        /// GET /api/ModelManagement/default-model
        /// </summary>
        [HttpGet("default-model")]
        [ProducesResponseType(typeof(ModelManagementDefaultModelDto), StatusCodes.Status200OK)]
        public async Task<ActionResult<ModelManagementDefaultModelDto?>> GetDefaultModel()
        {
            var model = await _context.ModelFiles
                .Where(m => m.IsDefaultTemplate && m.IsActive)
                .Select(m => new ModelManagementDefaultModelDto
                {
                    ModelFileId = m.ModelFileId,
                    ModelName = m.ModelName,
                    FileName = m.FileName,
                    FileSize = m.FileSize,
                    UploadedDate = m.UploadedDate,
                    Description = m.Description
                })
                .FirstOrDefaultAsync();

            return Ok(model); // null if no default set
        }

        /// <summary>
        /// Get sync history for a line model.
        /// GET /api/ModelManagement/line/{lineNumber}/models/{modelName}/sync-history?version=3.5
        /// </summary>
        [HttpGet("line/{lineNumber}/models/{modelName}/sync-history")]
        [ProducesResponseType(typeof(IEnumerable<ModelSyncHistory>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<ModelSyncHistory>>> GetSyncHistory(int lineNumber, string modelName, [FromQuery] string? version)
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
        [ProducesResponseType(typeof(IEnumerable<LineDeploymentHistory>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IEnumerable<LineDeploymentHistory>>> GetDeployHistory(int lineNumber, [FromQuery] string? version)
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


