using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;

using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    public class MCController : Controller
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<MCController> _logger;
        private readonly ICommandDeliveryService _commandDelivery;
        private readonly IConfigService _configService;
        private readonly IHubContext<AgentHub> _hubContext;

        public MCController(
            LensAssemblyDbContext context,
            ILogger<MCController> logger,
            ICommandDeliveryService commandDelivery,
            IConfigService configService,
            IHubContext<AgentHub> hubContext)
        {
            _context = context;
            _logger = logger;
            _commandDelivery = commandDelivery;
            _configService = configService;
            _hubContext = hubContext;
        }

        public async Task<IActionResult> Details(int id)
        {
            var mc = await _context.LensAssemblyMCs
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
                var mc = await _context.LensAssemblyMCs.FindAsync(mcId);
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
        public IActionResult GetLatestConfig(int mcId)
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
                var mc = await _context.LensAssemblyMCs.FindAsync(mcId);

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
                var mc = await _context.LensAssemblyMCs
                    .FirstOrDefaultAsync(p => p.MCId == mcId);

                if (mc == null)
                {
                    return Json(new { success = false, message = "MC not found" });
                }

                if (mc.LifecycleState == "Decommissioned")
                {
                    return Json(new { success = true, message = "MC is already decommissioned.", lifecycleState = mc.LifecycleState });
                }

                if (!mc.IsOnline)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Cannot delete this MC because the agent is offline. Bring the agent online so the service, agent, autoupdater, and local files can be decommissioned safely."
                    });
                }

                if (mc.LifecycleState == "PendingDecommission")
                {
                    return Json(new
                    {
                        success = true,
                        message = "Delete is already in progress. Waiting for agent decommission confirmation.",
                        lifecycleState = mc.LifecycleState,
                        commandId = mc.LifecycleCommandId
                    });
                }

                if (mc.LifecycleState != "Active" && mc.LifecycleState != "DecommissionFailed")
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = $"Cannot delete this MC while lifecycle state is {mc.LifecycleState}."
                    });
                }

                var activeCommands = await _context.AgentCommands
                    .Where(c => c.MCId == mcId &&
                                c.CommandType != "DecommissionAgent" &&
                                (c.Status == "Pending" || c.Status == "InProgress" || c.Status == "Delivered"))
                    .ToListAsync();
                foreach (var command in activeCommands)
                {
                    command.Status = "Cancelled";
                    command.ErrorMessage = "Cancelled because MC decommission was requested.";
                    command.ExecutedDate = DateTime.UtcNow;
                }

                var activeDeployments = await _context.UpdateDeployments
                    .Where(d => d.MCId == mcId &&
                                d.Status != "Completed" &&
                                d.Status != "Failed" &&
                                d.Status != "Cancelled" &&
                                d.Status != "Skipped")
                    .ToListAsync();
                foreach (var deployment in activeDeployments)
                {
                    deployment.Status = "Cancelled";
                    deployment.ErrorMessage = "Cancelled because MC decommission was requested.";
                    deployment.CompletedDateUtc = DateTime.UtcNow;
                }

                mc.LifecycleState = "PendingDecommission";
                mc.LifecycleRequestedAtUtc = DateTime.UtcNow;
                mc.LifecycleCompletedAtUtc = null;
                mc.LifecycleError = null;
                mc.LastUpdated = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                var commandData = JsonConvert.SerializeObject(new
                {
                    Reason = "Delete requested from Factory Monitoring UI",
                    CleanupMode = "Full"
                });
                int commandId;
                try
                {
                    commandId = await _commandDelivery.SendCommandAsync(mcId, "DecommissionAgent", commandData);
                }
                catch (Exception ex)
                {
                    mc.LifecycleState = "DecommissionFailed";
                    mc.LifecycleError = "Failed to queue decommission command: " + ex.Message;
                    mc.LifecycleCompletedAtUtc = DateTime.UtcNow;
                    mc.LastUpdated = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                    throw;
                }

                mc.LifecycleCommandId = commandId;
                mc.LastUpdated = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                await _hubContext.Clients.All.SendAsync("McStatusChanged", new
                {
                    MCId = mc.MCId,
                    IsOnline = mc.IsOnline,
                    IsApplicationRunning = mc.IsApplicationRunning,
                    LastHeartbeat = mc.LastHeartbeat,
                    LifecycleState = mc.LifecycleState,
                    LifecycleError = mc.LifecycleError
                });

                return Json(new
                {
                    success = true,
                    message = "Delete started. The online agent will ask the service to uninstall the service, agent, autoupdater, and local monitoring files. LAI and logs will be preserved. Manual setup.exe registration is required before this MC can be used again.",
                    isOffline = false,
                    lifecycleState = mc.LifecycleState,
                    commandId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting MC");
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

