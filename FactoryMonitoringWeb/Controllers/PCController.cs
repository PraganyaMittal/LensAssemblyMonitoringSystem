using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Text;
using FactoryMonitoringWeb.Models.DTOs; // Ensure DTOs are imported

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    public class PCController : Controller
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<PCController> _logger;

        public PCController(FactoryDbContext context, ILogger<PCController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // --- VALIDATION HELPER ---
        private bool IsValidPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;
            // Check for directory traversal attempts
            if (path.Contains("..") || path.Contains("~")) return false;
            // Check for invalid file system characters
            if (path.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return false;
            return true;
        }
        // -------------------------

        public async Task<IActionResult> Details(int id)
        {
            var pc = await _context.FactoryPCs
                .Include(p => p.ConfigFile)
                .Include(p => p.Models)
                .FirstOrDefaultAsync(p => p.PCId == id);

            if (pc == null)
            {
                return NotFound();
            }

            return View(pc);
        }

        [HttpPost("UpdateConfig")]
        public async Task<IActionResult> UpdateConfig(int pcId, string configContent)
        {
            try
            {
                var config = await _context.ConfigFiles.FirstOrDefaultAsync(c => c.PCId == pcId);

                if (config == null)
                {
                    return Json(new { success = false, message = "Config file not found" });
                }

                config.UpdatedContent = configContent;
                config.PendingUpdate = true;
                config.UpdateRequestTime = DateTime.Now;
                config.UpdateApplied = false;

                // Deduplication
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.PCId == pcId && c.Status == "Pending" && c.CommandType == "UpdateConfig")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                var command = new AgentCommand
                {
                    PCId = pcId,
                    CommandType = "UpdateConfig",
                    CommandData = configContent,
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

                return Json(new { success = true, message = "Config update queued successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating config");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpGet("DownloadConfig")]
        public async Task<IActionResult> DownloadConfig(int pcId)
        {
            try
            {
                var config = await _context.ConfigFiles.FirstOrDefaultAsync(c => c.PCId == pcId);

                if (config == null || string.IsNullOrEmpty(config.ConfigContent))
                {
                    return NotFound("Config file not found");
                }

                var pc = await _context.FactoryPCs.FindAsync(pcId);
                var fileName = $"config_Line{pc?.LineNumber ?? 0}_PC{pc?.PCNumber ?? 0}.txt";

                var bytes = Encoding.UTF8.GetBytes(config.ConfigContent);
                return File(bytes, "text/plain", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading config");
                return StatusCode(500, "Error downloading config file");
            }
        }

        [HttpPost("ChangeModel")]
        public async Task<IActionResult> ChangeModel(int pcId, string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.PCId == pcId && m.ModelName == modelName);

                if (model == null)
                {
                    return Json(new { success = false, message = "Model not found" });
                }


                // Deduplication
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.PCId == pcId && c.Status == "Pending" && c.CommandType == "ChangeModel")
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                var command = new AgentCommand
                {
                    PCId = pcId,
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

                return Json(new { success = true, message = "Model change command queued" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing model");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }


        [HttpPost("DownloadModel")]
        public async Task<IActionResult> DownloadModel(int pcId, string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.PCId == pcId && m.ModelName == modelName);

                if (model == null)
                {
                    return Json(new { success = false, message = "Model not found" });
                }


                // Deduplication: Since this is a manual download request, let's clear any other model ops
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.PCId == pcId && c.Status == "Pending" && 
                           (c.CommandType == "DownloadModel" || c.CommandType == "UploadModel" || c.CommandType == "ChangeModel"))
                    .ToListAsync();
                if (pendingCmds.Any()) _context.AgentCommands.RemoveRange(pendingCmds);

                var command = new AgentCommand
                {
                    PCId = pcId,
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

                return Json(new { success = true, message = "Model download initiated", commandId = command.CommandId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initiating model download");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpGet("GetModels")]
        public async Task<IActionResult> GetModels(int pcId)
        {
            try
            {
                var models = await _context.Models
                    .Where(m => m.PCId == pcId)
                    .Select(m => new
                    {
                        modelName = m.ModelName,
                        modelPath = m.ModelPath,
                        isCurrent = m.IsCurrentModel,
                        lastUsed = m.LastUsed
                    })
                    .ToListAsync();

                return Json(new
                {
                    success = true,
                    models = models
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting models");
                return Json(new { success = false, error = ex.Message });
            }
        }

        [HttpGet("GetLatestConfig")]
        public async Task<IActionResult> GetLatestConfig(int pcId)
        {
            try
            {
                var config = await _context.ConfigFiles
                    .FirstOrDefaultAsync(c => c.PCId == pcId);

                if (config == null)
                {
                    return Json(new { updated = false });
                }

                return Json(new
                {
                    updated = true,
                    configContent = config.ConfigContent,
                    lastModified = config.LastModified
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting latest config");
                return Json(new { updated = false, error = ex.Message });
            }
        }

        [HttpGet("GetPCStatus")]
        public async Task<IActionResult> GetPCStatus(int pcId)
        {
            try
            {
                var pc = await _context.FactoryPCs.FindAsync(pcId);

                if (pc == null)
                {
                    return Json(new { success = false });
                }

                return Json(new
                {
                    success = true,
                    isOnline = pc.IsOnline,
                    isApplicationRunning = pc.IsApplicationRunning,
                    lastHeartbeat = pc.LastHeartbeat?.ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting PC status");
                return Json(new { success = false, error = ex.Message });
            }
        }

        [HttpPost("DeletePC")]
        public async Task<IActionResult> DeletePC(int pcId)
        {
            try
            {
                var pc = await _context.FactoryPCs
                    .Include(p => p.ConfigFile)
                    .Include(p => p.Models)
                    .FirstOrDefaultAsync(p => p.PCId == pcId);

                if (pc == null)
                {
                    return Json(new { success = false, message = "PC not found" });
                }

                // 1. Queue Reset Command (Best Effort)
                // 1. Queue Reset Command (Best Effort)
                // NO LONGER NEEDED: AgentApiController handles "Orphaned" agents by sending Reset automatically.
                // We just proceed to delete everything immediately.
                
                bool isOffline = !pc.IsOnline;

                // 2. Manual Cleanup of Dependencies (Safe Hard Delete)
                
                // Models
                var models = await _context.Models.Where(m => m.PCId == pcId).ToListAsync();
                _context.Models.RemoveRange(models);

                // Config File
                var config = await _context.ConfigFiles.FirstOrDefaultAsync(c => c.PCId == pcId);
                if (config != null) _context.ConfigFiles.Remove(config);

                // Agent Commands (Including the one we just made, effectively cancelling it for persistence, 
                // but if we had a live SignalR connection, we'd send it there directly. 
                // For now, removing them from DB cleans the record.)
                var commands = await _context.AgentCommands.Where(c => c.PCId == pcId).ToListAsync();
                _context.AgentCommands.RemoveRange(commands);

                // Model Distributions
                var distributions = await _context.ModelDistributions.Where(d => d.PCId == pcId).ToListAsync();
                _context.ModelDistributions.RemoveRange(distributions);

                // 3. Delete the PC
                _context.FactoryPCs.Remove(pc);

                await _context.SaveChangesAsync();

                string message = "PC deleted successfully.";
                if (isOffline)
                {
                    message = "PC deleted from database. Agent is OFFLINE: You must manually delete 'agent_config.json' on the device.";
                }
                else
                {
                    message = "PC deleted. Reset signal sent to Agent (if connected).";
                }

                return Json(new
                {
                    success = true,
                    message = message,
                    isOffline = isOffline
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting PC");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpPost("UpdatePC")]
        public async Task<IActionResult> UpdatePC([FromBody] PCUpdateRequest request)
        {
            try
            {
                // 1. DATA VALIDATION (DTO Annotations)
                if (!ModelState.IsValid)
                {
                    var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList();
                    return Json(new { success = false, message = "Validation failed: " + string.Join(", ", errors) });
                }

                // 2. LOGIC VALIDATION (Path Security)
                if (!IsValidPath(request.ConfigFilePath) ||
                    !IsValidPath(request.LogFolderPath) ||
                    !IsValidPath(request.ModelFolderPath))
                {
                    return Json(new { success = false, message = "Invalid characters or traversal sequence (..) detected in file paths." });
                }

                var pc = await _context.FactoryPCs.FindAsync(request.PCId);
                if (pc == null)
                {
                    return Json(new { success = false, message = "PC not found" });
                }

                // Check for conflicts
                if (pc.LineNumber != request.LineNumber || pc.PCNumber != request.PCNumber || pc.ModelVersion != request.ModelVersion)
                {
                    var conflict = await _context.FactoryPCs.AnyAsync(p =>
                        p.PCId != request.PCId &&
                        p.LineNumber == request.LineNumber &&
                        p.PCNumber == request.PCNumber &&
                        p.ModelVersion == request.ModelVersion);

                    if (conflict)
                    {
                        return Json(new { success = false, message = "A PC with this Line/PC Number/Version combination already exists." });
                    }
                }

                // Update fields
                pc.LineNumber = request.LineNumber;
                pc.PCNumber = request.PCNumber;
                pc.IPAddress = request.IPAddress;
                pc.ConfigFilePath = request.ConfigFilePath;
                pc.LogFolderPath = request.LogFolderPath;
                pc.ModelFolderPath = request.ModelFolderPath;
                pc.ModelVersion = request.ModelVersion;
                pc.LastUpdated = DateTime.Now;

                var agentSettings = new
                {
                    LineNumber = request.LineNumber,
                    PCNumber = request.PCNumber,
                    ModelVersion = request.ModelVersion,
                };

                var updateCmd = new AgentCommand
                {
                    PCId = pc.PCId,
                    CommandType = "UpdateAgentSettings",
                    CommandData = JsonConvert.SerializeObject(agentSettings),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };
                _context.AgentCommands.Add(updateCmd);

                await _context.SaveChangesAsync();

                return Json(new { success = true, message = "PC updated and sync command queued" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating PC");
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        [HttpPost("DeleteModel")]
        public async Task<IActionResult> DeleteModel(int pcId, string modelName)
        {
            try
            {
                // 1. Fetch the model from the database
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.PCId == pcId && m.ModelName == modelName);

                if (model == null)
                {
                    return Json(new { success = false, message = "Model not found." });
                }

                // 2. SAFETY CHECK: Prevent deletion if this is the Active Model
                if (model.IsCurrentModel)
                {
                    // This message will be displayed by the frontend alert()
                    return Json(new { success = false, message = "⚠️ Cannot delete this model because it is currently ACTIVE." });
                }

                // 3. Clear any existing pending commands for this model (Deduplication)
                var pendingCmds = await _context.AgentCommands
                    .Where(c => c.PCId == pcId && c.Status == "Pending" && c.CommandType == "DeleteModel")
                    .ToListAsync();

                if (pendingCmds.Any())
                {
                    _context.AgentCommands.RemoveRange(pendingCmds);
                }

                // 4. Queue the Delete Command for the Agent
                var command = new AgentCommand
                {
                    PCId = pcId,
                    CommandType = "DeleteModel",
                    CommandData = JsonConvert.SerializeObject(new { ModelName = modelName }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                _context.AgentCommands.Add(command);
                await _context.SaveChangesAsync();

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