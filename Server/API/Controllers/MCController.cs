using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.ComponentModel.DataAnnotations;
using System.Text;
using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;

using LensAssemblyMonitoringWeb.Services;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class MCController : ControllerBase
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

        /// <summary>
        /// Pushes a new configuration file to the Machine Controller.
        /// </summary>
        [HttpPost("UpdateConfig")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> UpdateConfig([FromForm] int mcId, IFormFile configFile)
        {
            try
            {
                if (configFile == null || configFile.Length == 0)
                {
                    return BadRequest(new ErrorResponse { Message = "No file uploaded", ErrorCode = "config_file_missing" });
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

                return Ok(new BasicResponse { Success = true, Message = "Config update pushed to agent securely." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating config");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = $"Error: {ex.Message}",
                    ErrorCode = "config_update_failed"
                });
            }
        }

        /// <summary>
        /// Initiates a download of the configuration file from the Machine Controller.
        /// </summary>
        [HttpGet("DownloadConfig")]
        [Produces("text/plain", "application/json")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status408RequestTimeout)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> DownloadConfig([FromQuery] int mcId)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs.FindAsync(mcId);
                if (mc == null)
                {
                    return NotFound(new ErrorResponse { Message = "MC not found or offline.", ErrorCode = "mc_not_found" });
                }

                if (!mc.IsOnline)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Message = "Cannot download config because this MC is currently offline.",
                        ErrorCode = "mc_offline"
                    });
                }

                var configContent = await _configService.GetConfigContentAsync(mcId);

                var fileName = $"config_Line{mc.LineNumber}_MC{mc.MCNumber}.ini";
                var bytes = Encoding.UTF8.GetBytes(configContent);
                return File(bytes, "text/plain", fileName);
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "Config file not found on MC {MCId}", mcId);
                return NotFound(new ErrorResponse
                {
                    Message = "The config file might have been deleted from the Machine.",
                    ErrorCode = "config_file_not_found"
                });
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Config download timed out for MC {MCId}", mcId);
                return StatusCode(StatusCodes.Status408RequestTimeout, new ErrorResponse
                {
                    Message = "Agent did not respond with config in time. It may be busy or partially disconnected.",
                    ErrorCode = "agent_config_timeout"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting config download for MC {MCId}", mcId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Error requesting config file: " + ex.Message,
                    ErrorCode = "config_download_failed"
                });
            }
        }

        /// <summary>
        /// Commands the Machine Controller to switch to a different AI model.
        /// </summary>
        [HttpPost("ChangeModel")]
        [Consumes("application/x-www-form-urlencoded")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> ChangeModel([FromForm] int mcId, [FromForm, Required] string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                if (model == null)
                {
                    return NotFound(new ErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });
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

                return Ok(new BasicResponse { Success = true, Message = "Model change command queued" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing model");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = $"Error: {ex.Message}",
                    ErrorCode = "model_change_failed"
                });
            }
        }

        /// <summary>
        /// Commands the Machine Controller to download a model from the Server.
        /// </summary>
        [HttpPost("DownloadModel")]
        [Consumes("application/x-www-form-urlencoded")]
        [ProducesResponseType(typeof(McCommandResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<McCommandResponse>> DownloadModel([FromForm] int mcId, [FromForm, Required] string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                if (model == null)
                {
                    return NotFound(new ErrorResponse { Message = "Model not found", ErrorCode = "model_not_found" });
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

                return Ok(new McCommandResponse
                {
                    Success = true,
                    Message = "Model download initiated",
                    CommandId = commandId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initiating model download");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = $"Error: {ex.Message}",
                    ErrorCode = "model_download_failed"
                });
            }
        }

        /// <summary>
        /// Initiates the decommissioning and removal process for a Machine Controller.
        /// </summary>
        [HttpPost("DeleteMC")]
        [ProducesResponseType(typeof(McCommandResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<McCommandResponse>> DeleteMC([FromQuery] int mcId)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs
                    .FirstOrDefaultAsync(p => p.MCId == mcId);

                if (mc == null)
                {
                    return NotFound(new ErrorResponse { Message = "MC not found", ErrorCode = "mc_not_found" });
                }

                if (mc.LifecycleState == "Decommissioned")
                {
                    return Ok(new McCommandResponse
                    {
                        Success = true,
                        Message = "MC is already decommissioned.",
                        LifecycleState = mc.LifecycleState
                    });
                }

                if (!mc.IsOnline)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Message = "Cannot delete this MC because the agent is offline. Bring the agent online so the service, agent, autoupdater, and local files can be decommissioned safely.",
                        ErrorCode = "mc_offline"
                    });
                }

                if (mc.LifecycleState == "PendingDecommission")
                {
                    return Ok(new McCommandResponse
                    {
                        Success = true,
                        Message = "Delete is already in progress. Waiting for agent decommission confirmation.",
                        LifecycleState = mc.LifecycleState,
                        CommandId = mc.LifecycleCommandId
                    });
                }

                if (mc.LifecycleState != "Active" && mc.LifecycleState != "DecommissionFailed")
                {
                    return BadRequest(new ErrorResponse
                    {
                        Message = $"Cannot delete this MC while lifecycle state is {mc.LifecycleState}.",
                        ErrorCode = "invalid_lifecycle_state"
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

                return Ok(new McCommandResponse
                {
                    Success = true,
                    Message = "Delete started. The online agent will ask the service to uninstall the service, agent, autoupdater, and local monitoring files. LAI and logs will be preserved. Manual setup.exe registration is required before this MC can be used again.",
                    IsOffline = false,
                    LifecycleState = mc.LifecycleState,
                    CommandId = commandId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting MC");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = $"Error: {ex.Message}",
                    ErrorCode = "mc_delete_failed"
                });
            }
        }

        [HttpPost("DeleteModel")]
        [Consumes("application/x-www-form-urlencoded")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> DeleteModel([FromForm] int mcId, [FromForm, Required] string modelName)
        {
            try
            {
                var model = await _context.Models
                    .FirstOrDefaultAsync(m => m.MCId == mcId && m.ModelName == modelName);

                if (model != null && model.IsCurrentModel)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Message = "Cannot delete this model because it is currently active.",
                        ErrorCode = "active_model_delete_blocked"
                    });
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

                return Ok(new BasicResponse { Success = true, Message = "Delete command queued successfully." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting model");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = $"Error: {ex.Message}",
                    ErrorCode = "model_delete_failed"
                });
            }
        }
    }
}

