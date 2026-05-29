using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using LensAssemblyMonitoringWeb.Controllers.Hubs;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class DiagnosticsController : ControllerBase
    {
        private readonly ILensAssemblyMCRepository _mcRepository;
        private readonly ILogger<DiagnosticsController> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        public DiagnosticsController(
            ILensAssemblyMCRepository mcRepository,
            ILogger<DiagnosticsController> logger,
            IHubContext<AgentHub> hubContext)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        }

        /// <summary>
        /// Reports system diagnostics (memory, CPU, errors) from an agent.
        /// </summary>
        [HttpPost("diagnostics")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> PostDiagnostics(
            [FromBody] DiagnosticsRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var mc = await _mcRepository.GetByIdAsync(request.MCId, cancellationToken);
                if (mc == null)
                {
                    return NotFound(new ApiResponse { Success = false, Message = "MC not found" });
                }

                // Update diagnostics fields
                if (request.MemoryMB.HasValue)
                    mc.MemoryMB = request.MemoryMB.Value;
                if (request.UptimeMinutes.HasValue)
                    mc.UptimeMinutes = request.UptimeMinutes.Value;
                if (request.ErrorCount.HasValue)
                    mc.ErrorCount = request.ErrorCount.Value;
                if (request.ThreadCount.HasValue)
                    mc.ThreadCount = request.ThreadCount.Value;

                mc.LastDiagnostics = DateTime.UtcNow;

                // Config drift detection has been completely removed from the architecture.

                await _mcRepository.UpdateAsync(mc, cancellationToken);

                return Ok(new ApiResponse { Success = true, Message = "Diagnostics received" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing diagnostics for MC {MCId}", request.MCId);
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }
    }
}
