using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;

using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    public class MCController : Controller
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<MCController> _logger;
        private readonly ICommandDeliveryService _commandDelivery;
        private readonly IConfigService _configService;

        public MCController(FactoryDbContext context, ILogger<MCController> logger, ICommandDeliveryService commandDelivery, IConfigService configService)
        {
            _context = context;
            _logger = logger;
            _commandDelivery = commandDelivery;
            _configService = configService;
        }

        
        private bool IsValidPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;
            if (path.Contains("..") || path.Contains("~")) return false;
            if (path.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return false;
            return true;
        }

        public async Task<IActionResult> Details(int id)
        {
            var mc = await _context.FactoryMCs
                .Include(p => p.Models)
                .FirstOrDefaultAsync(p => p.MCId == id);

            if (mc == null)
            {
                return NotFound();
            }

            return View(mc);
        }

        [HttpPost("UpdateConfig")]
        public async Task<IActionResult> UpdateConfig(int mcId, IFormFile configFile)
        {
            try
            {
                if (configFile == null || configFile.Length == 0)
                {
                    return Json(new { success = false, message = "No file uploaded" });
                }

                string configContent;
                using (var reader = new StreamReader(configFile.OpenReadStream()))
                {
                    configContent = await reader.ReadToEndAsync();
                }

                
                

                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && c.CommandType == "UpdateConfig")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);
                await _context.SaveChangesAsync();

                await _commandDelivery.SendCommandAsync(mcId, "UpdateConfig", configContent);

                return Json(new { success = true, message = "Config update pushed to agent securely." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating config");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpGet("DownloadConfig")]
        public async Task<IActionResult> DownloadConfig(int mcId)
        {
            try
            {
                var mc = await _context.FactoryMCs.FindAsync(mcId);
                if (mc == null) return NotFound(new { success = false, message = "MC not found or offline." });

                if (!mc.IsOnline)
                {
                    return BadRequest(new { success = false, message = "Cannot download config because this MC is currently offline." });
                }

                
                var configContent = await _configService.GetConfigContentAsync(mcId);

                var fileName = $"config_Line{mc.LineNumber}_MC{mc.MCNumber}.ini";
                var bytes = Encoding.UTF8.GetBytes(configContent);
                return File(bytes, "text/plain", fileName);
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "Config file not found on MC {MCId}", mcId);
                return NotFound(new { success = false, message = "The config file might have been deleted from the Machine." });
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Config download timed out for MC {MCId}", mcId);
                return StatusCode(408, new { success = false, message = "Agent did not respond with config in time. It may be busy or partially disconnected." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting config download for MC {MCId}", mcId);
                return StatusCode(500, new { success = false, message = "Error requesting config file: " + ex.Message });
            }
        }

        
        

        [HttpPost("ChangeModel")]
        public async Task<IActionResult> ChangeModel(int mcId, string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                if (model == null)
                {
                    return Json(new { success = false, message = "Model not found" });
                }

                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && c.CommandType == "ChangeModel")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);
                await _context.SaveChangesAsync();

                var commandData = JsonConvert.SerializeObject(new
                {
                    ModelName = modelName,
                    ModelPath = model.ModelPath
                });

                await _commandDelivery.SendCommandAsync(mcId, "ChangeModel", commandData);

                return Json(new { success = true, message = "Model change command queued" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing model");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpPost("DownloadModel")]
        public async Task<IActionResult> DownloadModel(int mcId, string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                if (model == null)
                {
                    return Json(new { success = false, message = "Model not found" });
                }

                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && 
                           (c.CommandType == "DownloadModel" || c.CommandType == "UploadModel" || c.CommandType == "ChangeModel"))
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);
                await _context.SaveChangesAsync();

                var commandData = JsonConvert.SerializeObject(new
                {
                    ModelName = modelName,
                    ModelPath = model.ModelPath
                });

                int commandId = await _commandDelivery.SendCommandAsync(mcId, "DownloadModel", commandData);

                return Json(new { success = true, message = "Model download initiated", commandId = commandId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initiating model download");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpGet("GetModels")]
        public async Task<IActionResult> GetModels(int mcId)
        {
            try
            {
                var models = await _context.Models
                    .Where(m => m.MCId == mcId)
                    .Select(m => new
                    {
                        modelName = m.ModelName,
                        modelPath = m.ModelPath,
                        isCurrent = m.IsCurrentModel,
                        lastUsed = m.LastUsed
                    })
                    .ToListAsync();

                return Json(new { success = true, models = models });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting models");
                return Json(new { success = false, error = ex.Message });
            }
        }

        [HttpGet("GetLatestConfig")]
        public async Task<IActionResult> GetLatestConfig(int mcId)
        {
            try
            {
                
                
                return Json(new { updated = false, message = "Config must be downloaded on-demand to view." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting latest config");
                return Json(new { updated = false, error = ex.Message });
            }
        }

        [HttpGet("GetMCStatus")]
        public async Task<IActionResult> GetMCStatus(int mcId)
        {
            try
            {
                var mc = await _context.FactoryMCs.FindAsync(mcId);

                if (mc == null)
                {
                    return Json(new { success = false });
                }

                return Json(new
                {
                    success = true,
                    isOnline = mc.IsOnline,
                    isApplicationRunning = mc.IsApplicationRunning,
                    lastHeartbeat = mc.LastHeartbeat?.ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting MC status");
                return Json(new { success = false, error = ex.Message });
            }
        }

        [HttpPost("DeleteMC")]
        public async Task<IActionResult> DeleteMC(int mcId)
        {
            try
            {
                var mc = await _context.FactoryMCs
                    .Include(p => p.Models)
                    .FirstOrDefaultAsync(p => p.MCId == mcId);

                if (mc == null)
                {
                    return Json(new { success = false, message = "MC not found" });
                }

                bool isOffline = !mc.IsOnline;

                var models = await _context.Models.Where(m => m.MCId == mcId).ToListAsync();
                _context.Models.RemoveRange(models);

                var commands = await _context.AgentCommands.Where(c => c.MCId == mcId).ToListAsync();
                _context.AgentCommands.RemoveRange(commands);

                _context.FactoryMCs.Remove(mc);

                await _context.SaveChangesAsync();

                string message = "MC deleted successfully.";
                if (isOffline)
                {
                    message = "MC deleted from database. Agent is OFFLINE: You must manually delete 'agent_config.json' on the device.";
                }
                else
                {
                    message = "MC deleted. Reset signal sent to Agent (if connected).";
                }

                return Json(new { success = true, message = message, isOffline = isOffline });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting MC");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpPost("UpdateMC")]
        public async Task<IActionResult> UpdateMC([FromBody] MCUpdateRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList();
                    return Json(new { success = false, message = "Validation failed: " + string.Join(", ", errors) });
                }

                if (!IsValidPath(request.ConfigFilePath) ||
                    !IsValidPath(request.LogFolderPath) ||
                    !IsValidPath(request.ModelFolderPath))
                {
                    return Json(new { success = false, message = "Invalid characters or traversal sequence (..) detected in file paths." });
                }

                var mc = await _context.FactoryMCs.FindAsync(request.MCId);
                if (mc == null)
                {
                    return Json(new { success = false, message = "MC not found" });
                }

                if (mc.LineNumber != request.LineNumber || mc.MCNumber != request.MCNumber || mc.ModelVersion != request.ModelVersion)
                {
                    var conflict = await _context.FactoryMCs.AnyAsync(p =>
                        p.MCId != request.MCId &&
                        p.LineNumber == request.LineNumber &&
                        p.MCNumber == request.MCNumber &&
                        p.ModelVersion == request.ModelVersion);

                    if (conflict)
                    {
                        return Json(new { success = false, message = "A MC with this Line/MC Number/Version combination already exists." });
                    }
                }

                mc.LineNumber = request.LineNumber;
                mc.MCNumber = request.MCNumber;
                mc.IPAddress = request.IPAddress;
                mc.ConfigFilePath = request.ConfigFilePath;
                mc.LogFolderPath = request.LogFolderPath;
                mc.ModelVersion = request.ModelVersion;
                mc.LastUpdated = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                var agentSettings = new
                {
                    lineNumber = request.LineNumber,
                    mcNumber = request.MCNumber,
                    modelVersion = request.ModelVersion,
                };

                var commandData = JsonConvert.SerializeObject(agentSettings);
                await _commandDelivery.SendCommandAsync(mc.MCId, "UpdateAgentSettings", commandData);

                return Json(new { success = true, message = "MC updated and sync command queued" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating MC");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpPost("DeleteModel")]
        public async Task<IActionResult> DeleteModel(int mcId, string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                
                if (model != null && model.IsCurrentModel)
                {
                    return Json(new { success = false, message = "âš ï¸ Cannot delete this model because it is currently ACTIVE." });
                }

                
                if (model != null)
                {
                    _context.Models.Remove(model);
                }

                
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && c.CommandType == "DeleteModel")
                    .ToListAsync();

                if (pendingCmds.Any())
                {
                    _context.AgentCommands.RemoveRange(pendingCmds);
                }
                await _context.SaveChangesAsync();

                var commandData = JsonConvert.SerializeObject(new { ModelName = modelName });
                await _commandDelivery.SendCommandAsync(mcId, "DeleteModel", commandData);

                return Json(new { success = true, message = "Delete command queued successfully." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting model");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }
    }
}

