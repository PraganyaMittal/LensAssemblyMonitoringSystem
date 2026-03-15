using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FactoryMonitoringWeb.Controllers
{

    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class HeartbeatController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogger<HeartbeatController> _logger;

        public HeartbeatController(
            ICommandDispatcher dispatcher,
            ILogger<HeartbeatController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        [HttpPost("heartbeat")]
        [ProducesResponseType(typeof(HeartbeatResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<HeartbeatResponse>> Heartbeat(
            [FromBody] HeartbeatRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new HeartbeatCommand(request);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                var response = new HeartbeatResponse
                {
                    Success = result.Success,
                    HasPendingCommands = result.HasPendingCommands,
                    Commands = result.Commands.ToList()
                };

                return Ok(response);
            }
            catch (AgentNotFoundException ex)
            {
                _logger.LogWarning("Heartbeat for unknown PC {MCId}", ex.MCId);
                return NotFound(new HeartbeatResponse { Success = false });
            }
            catch (FactoryMonitoringException ex)
            {
                _logger.LogError(ex, "Domain error during heartbeat for PC {MCId}", request.MCId);
                return StatusCode(500, new HeartbeatResponse { Success = false });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during heartbeat for PC {MCId}", request.MCId);
                return StatusCode(500, new HeartbeatResponse { Success = false });
            }
        }
    }
}

