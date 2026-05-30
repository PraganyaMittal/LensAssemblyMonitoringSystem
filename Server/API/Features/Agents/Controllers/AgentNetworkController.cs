using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Features.Agents.Controllers
{
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class AgentNetworkController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<AgentNetworkController> _logger;

        public AgentNetworkController(LensAssemblyDbContext context, ILogger<AgentNetworkController> logger)
        {
            _context = context;
            _logger = logger;
        }

        public class UpdateIpRequest
        {
            public int MCId { get; set; }
            public string CurrentIpAddress { get; set; } = string.Empty;
        }

        /// <summary>
        /// Updates the current IP address of a Machine Controller.
        /// </summary>
        /// <param name="request">The IP update payload.</param>
        /// <returns>A status message.</returns>
        [HttpPost("update-ip")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> UpdateIp([FromBody] UpdateIpRequest request)
        {
            try
            {
                if (request == null || request.MCId <= 0 || string.IsNullOrWhiteSpace(request.CurrentIpAddress))
                {
                    return BadRequest(new ApiErrorResponse { Message = "Invalid request payload.", ErrorCode = "invalid_agent_ip_payload" });
                }

                var machine = await _context.LensAssemblyMCs.FindAsync(request.MCId);
                if (machine == null)
                {
                    return NotFound(new ApiErrorResponse { Message = "Machine not found.", ErrorCode = "machine_not_found" });
                }

                if (machine.IPAddress != request.CurrentIpAddress)
                {
                    machine.IPAddress = request.CurrentIpAddress;
                    machine.LastUpdated = DateTime.Now;
                    await _context.SaveChangesAsync();
                    
                    _logger.LogInformation("Updated IP address for MCId {MCId} to {NewIp}", request.MCId, request.CurrentIpAddress);

                }

                return Ok(new BasicResponse { Success = true, Message = "IP address updated successfully." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating IP address for MCId {MCId}", request?.MCId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse {
                    Message = "Internal server error occurred.",
                    ErrorCode = "agent_ip_update_failed"
                });
            }
        }
        /// <summary>
        /// Retrieves core configuration settings for a specific Machine Controller.
        /// </summary>
        /// <param name="mcId">The unique ID of the machine.</param>
        /// <returns>Settings data.</returns>
        [HttpGet("settings/{mcId}")]
        [ProducesResponseType(typeof(AgentSettingsResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AgentSettingsResponse>> GetSettings(int mcId)
        {
            try
            {
                if (mcId <= 0)
                {
                    return BadRequest(new ApiErrorResponse { Message = "Invalid MCId.", ErrorCode = "invalid_mc_id" });
                }

                var machine = await _context.LensAssemblyMCs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(m => m.MCId == mcId);

                if (machine == null)
                {
                    return NotFound(new ApiErrorResponse { Message = "Machine not found.", ErrorCode = "machine_not_found" });
                }

                return Ok(new AgentSettingsResponse
                {
                    Success = true,
                    Data = new AgentSettingsDto
                    {
                        LineNumber = machine.LineNumber,
                        MCNumber = machine.MCNumber,
                        ConfigFilePath = machine.ConfigFilePath,
                        LogFolderPath = machine.LogFolderPath,
                        ModelFolderPath = machine.ModelFolderPath,
                        GenerationNo = machine.GenerationNo
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching settings for MCId {MCId}", mcId);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse {
                    Message = "Internal server error occurred.",
                    ErrorCode = "agent_settings_failed"
                });
            }
        }
    }
}





