using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class AgentNetworkController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<AgentNetworkController> _logger;

        public AgentNetworkController(FactoryDbContext context, ILogger<AgentNetworkController> logger)
        {
            _context = context;
            _logger = logger;
        }

        public class UpdateIpRequest
        {
            public int MCId { get; set; }
            public string CurrentIpAddress { get; set; } = string.Empty;
        }

        [HttpPost("update-ip")]
        public async Task<IActionResult> UpdateIp([FromBody] UpdateIpRequest request)
        {
            try
            {
                if (request == null || request.MCId <= 0 || string.IsNullOrWhiteSpace(request.CurrentIpAddress))
                {
                    return BadRequest(new { Success = false, Message = "Invalid request payload." });
                }

                var machine = await _context.FactoryMCs.FindAsync(request.MCId);
                if (machine == null)
                {
                    return NotFound(new { Success = false, Message = "Machine not found." });
                }

                if (machine.IPAddress != request.CurrentIpAddress)
                {
                    machine.IPAddress = request.CurrentIpAddress;
                    machine.LastUpdated = DateTime.Now;
                    await _context.SaveChangesAsync();
                    
                    _logger.LogInformation("Updated IP address for MCId {MCId} to {NewIp}", request.MCId, request.CurrentIpAddress);

                }

                return Ok(new { Success = true, Message = "IP address updated successfully." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating IP address for MCId {MCId}", request?.MCId);
                return StatusCode(500, new { Success = false, Message = "Internal server error occurred." });
            }
        }
        [HttpGet("settings/{mcId}")]
        public async Task<IActionResult> GetSettings(int mcId)
        {
            try
            {
                if (mcId <= 0)
                {
                    return BadRequest(new { Success = false, Message = "Invalid MCId." });
                }

                var machine = await _context.FactoryMCs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(m => m.MCId == mcId);

                if (machine == null)
                {
                    return NotFound(new { Success = false, Message = "Machine not found." });
                }

                return Ok(new
                {
                    Success = true,
                    Data = new
                    {
                        machine.LineNumber,
                        machine.MCNumber,
                        machine.ConfigFilePath,
                        machine.LogFolderPath,
                        machine.ModelFolderPath,
                        machine.ModelVersion,
                        machine.InstallDir
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching settings for MCId {MCId}", mcId);
                return StatusCode(500, new { Success = false, Message = "Internal server error occurred." });
            }
        }
    }
}

