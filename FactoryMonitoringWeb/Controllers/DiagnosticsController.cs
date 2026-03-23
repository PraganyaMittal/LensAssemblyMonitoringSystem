using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using FactoryMonitoringWeb.Controllers.Hubs;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class DiagnosticsController : ControllerBase
    {
        private readonly IFactoryMCRepository _mcRepository;
        private readonly ILogger<DiagnosticsController> _logger;
        private readonly IHubContext<AgentHub> _hubContext;

        public DiagnosticsController(
            IFactoryMCRepository mcRepository,
            ILogger<DiagnosticsController> logger,
            IHubContext<AgentHub> hubContext)
        {
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        }

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

                // Config drift detection
                bool configDriftChanged = false;
                if (!string.IsNullOrWhiteSpace(request.ConfigHash))
                {
                    mc.ConfigHash = request.ConfigHash;

                    // Set baseline on first diagnostics report with config hash
                    if (string.IsNullOrWhiteSpace(mc.InitialConfigHash))
                    {
                        mc.InitialConfigHash = request.ConfigHash;
                    }

                    bool driftNow = mc.ConfigHash != mc.InitialConfigHash;
                    if (mc.ConfigDriftDetected != driftNow)
                    {
                        mc.ConfigDriftDetected = driftNow;
                        configDriftChanged = true;
                        if (driftNow)
                        {
                            _logger.LogWarning(
                                "Config drift detected for MC {MCId}. Hash changed from {Initial} to {Current}",
                                mc.MCId, mc.InitialConfigHash, mc.ConfigHash);
                        }
                    }
                }

                await _mcRepository.UpdateAsync(mc, cancellationToken);

                // Notify UI if config drift status changed
                if (configDriftChanged)
                {
                    await _hubContext.Clients.All.SendAsync("McStatusChanged", new
                    {
                        MCId = mc.MCId,
                        ConfigDriftDetected = mc.ConfigDriftDetected
                    }, cancellationToken);
                }

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
