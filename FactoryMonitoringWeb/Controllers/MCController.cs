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
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly IConfigService _configService;

        public MCController(FactoryDbContext context, ILogger<MCController> logger, IHubContext<AgentHub> hubContext, IConfigService configService)
        {
            _context = context;
            _logger = logger;
            _hubContext = hubContext;
            _configService = configService;
        }

        // --- VALIDATION HELPER ---
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

                // Config is embedded directly into the command payload.
                // It will be sent via SignalR or picked up by heartbeat.

                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && c.CommandType == "UpdateConfig")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                var command = new AgentCommand
                {
                    MCId = mcId,
                    CommandType = "UpdateConfig",
                    CommandData = configContent,
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                // Push via SignalR for instant delivery
                try
                {
                    await _hubContext.Clients.Group(mcId.ToString())
                        .SendAsync("ReceiveCommand",
                            command.CommandType,
                            command.CommandData,
                            command.CommandId.ToString());

                    command.Status = "Delivered";
                    command.ExecutedDate = DateTime.Now;
                    await _context.SaveChangesAsync();
                }
                catch (Exception hubEx)
                {
                    _logger.LogWarning(hubEx, "Failed to push UpdateConfig via SignalR to MC {MCId}", mcId);
                    // Command stays Pending — heartbeat will pick it up
                }

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
                if (mc == null) return NotFound(new { success = false, message = "PC not found or offline." });

                if (!mc.IsOnline)
                {
                    return BadRequest(new { success = false, message = "Cannot download config because this PC is currently offline." });
                }

                // Call ConfigService to signal agent and await the upload
                var configContent = await _configService.GetConfigContentAsync(mcId);

                var fileName = $"config_Line{mc.LineNumber}_MC{mc.MCNumber}.ini";
                var bytes = Encoding.UTF8.GetBytes(configContent);
                return File(bytes, "text/plain", fileName);
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Config download timed out for PC {MCId}", mcId);
                return StatusCode(408, new { success = false, message = "Agent did not respond with config in time. It may be busy or partially disconnected." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting config download for PC {MCId}", mcId);
                return StatusCode(500, new { success = false, message = "Error requesting config file: " + ex.Message });
            }
        }

        // RequestSync and RequestLineSync removed — models and config are
        // automatically synced via agent registration + heartbeat loop (every 15s).

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

                var command = new AgentCommand
                {
                    MCId = mcId,
                    CommandType = "ChangeModel",
                    CommandData = JsonConvert.SerializeObject(new
                    {
                        ModelName = modelName,
                        ModelPath = model.ModelPath
                    }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                // Push via SignalR for instant delivery
                try
                {
                    await _hubContext.Clients.Group(mcId.ToString())
                        .SendAsync("ReceiveCommand",
                            command.CommandType,
                            command.CommandData,
                            command.CommandId.ToString());

                    // Mark as Delivered so heartbeat won't return this command again
                    command.Status = "Delivered";
                    command.ExecutedDate = DateTime.Now;
                    await _context.SaveChangesAsync();
                }
                catch (Exception hubEx)
                {
                    _logger.LogWarning(hubEx, "Failed to push ChangeModel via SignalR to MC {MCId}", mcId);
                    // Command stays Pending — heartbeat will pick it up
                }

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

                var command = new AgentCommand
                {
                    MCId = mcId,
                    CommandType = "DownloadModel",
                    CommandData = JsonConvert.SerializeObject(new
                    {
                        ModelName = modelName,
                        ModelPath = model.ModelPath
                    }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                // Push via SignalR for instant delivery
                try
                {
                    await _hubContext.Clients.Group(mcId.ToString())
                        .SendAsync("ReceiveCommand",
                            command.CommandType,
                            command.CommandData,
                            command.CommandId.ToString());

                    // Mark as Delivered so heartbeat won't return this command again
                    command.Status = "Delivered";
                    command.ExecutedDate = DateTime.Now;
                    await _context.SaveChangesAsync();
                }
                catch (Exception hubEx)
                {
                    _logger.LogWarning(hubEx, "Failed to push DownloadModel via SignalR to MC {MCId}", mcId);
                    // Command stays Pending — heartbeat will pick it up
                }

                return Json(new { success = true, message = "Model download initiated", commandId = command.CommandId });
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
                // Legacy UI polling endpoint for config editing. Since it's on-demand now, 
                // we tell the UI it must rely on downloading the file.
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

                var distributions = await _context.ModelDistributions.Where(d => d.MCId == mcId).ToListAsync();
                _context.ModelDistributions.RemoveRange(distributions);

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
                mc.ModelFolderPath = request.ModelFolderPath;
                mc.ModelVersion = request.ModelVersion;
                mc.LastUpdated = DateTime.Now;

                var agentSettings = new
                {
                    lineNumber = request.LineNumber,
                    mcNumber = request.MCNumber,
                    modelVersion = request.ModelVersion,
                };

                var updateCmd = new AgentCommand
                {
                    MCId = mc.MCId,
                    CommandType = "UpdateAgentSettings",
                    CommandData = JsonConvert.SerializeObject(agentSettings),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };
                _context.AgentCommands.Add(updateCmd);

                await _context.SaveChangesAsync();

                // SignalR Push: Notify the agent immediately
                try
                {
                    await _hubContext.Clients.Group(mc.MCId.ToString())
                        .SendAsync("ReceiveCommand",
                            updateCmd.CommandType,
                            updateCmd.CommandData,
                            updateCmd.CommandId.ToString());

                    // Mark as Delivered so heartbeat won't return this command again
                    updateCmd.Status = "Delivered";
                    updateCmd.ExecutedDate = DateTime.Now;
                    await _context.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to send SignalR update command to Agent {MCId}", mc.MCId);
                    // Command stays Pending — heartbeat will pick it up
                }

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

                // If model exists in DB, check if it's active (can't delete active model)
                if (model != null && model.IsCurrentModel)
                {
                    return Json(new { success = false, message = "⚠️ Cannot delete this model because it is currently ACTIVE." });
                }

                // Remove model entry from DB if it exists
                if (model != null)
                {
                    _context.Models.Remove(model);
                }

                // Cancel any existing pending DeleteModel commands for this MC
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.MCId == mcId && c.Status == "Pending" && c.CommandType == "DeleteModel")
                    .ToListAsync();

                if (pendingCmds.Any())
                {
                    _context.AgentCommands.RemoveRange(pendingCmds);
                }

                // Always queue a DeleteModel command (agent handles gracefully if model doesn't exist on disk)
                var command = new AgentCommand
                {
                    MCId = mcId,
                    CommandType = "DeleteModel",
                    CommandData = JsonConvert.SerializeObject(new { ModelName = modelName }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                // Push via SignalR for instant delivery
                try
                {
                    await _hubContext.Clients.Group(mcId.ToString())
                        .SendAsync("ReceiveCommand",
                            command.CommandType,
                            command.CommandData,
                            command.CommandId.ToString());

                    // Mark as Delivered so heartbeat won't return this command again
                    command.Status = "Delivered";
                    command.ExecutedDate = DateTime.Now;
                    await _context.SaveChangesAsync();
                }
                catch (Exception hubEx)
                {
                    _logger.LogWarning(hubEx, "Failed to push DeleteModel via SignalR to MC {MCId}", mcId);
                    // Command stays Pending — heartbeat will pick it up
                }

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
