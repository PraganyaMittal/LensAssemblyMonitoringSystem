using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Thin controller for agent heartbeat endpoint.
    /// 
    /// Design Decision: Minimal controller for high-throughput path:
    /// 1. No business logic - delegates immediately to command dispatcher
    /// 2. Minimal allocations in the hot path
    /// 3. Structured error responses for each exception type
    /// 
    /// Performance: This endpoint is called every few seconds by potentially
    /// thousands of agents. Keep controller code minimal.
    /// </summary>
    [Route("api/agent")]
    [ApiController]
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

        /// <summary>
        /// Processes a heartbeat from an agent.
        /// Updates PC status and returns pending commands.
        /// </summary>
        /// <param name="request">Heartbeat request from the agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Heartbeat response with pending commands</returns>
        /// <response code="200">Heartbeat processed successfully</response>
        /// <response code="404">PC not found</response>
        /// <response code="500">Internal server error</response>
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
                _logger.LogWarning("Heartbeat for unknown PC {PCId}", ex.PCId);
                return NotFound(new HeartbeatResponse { Success = false });
            }
            catch (FactoryMonitoringException ex)
            {
                _logger.LogError(ex, "Domain error during heartbeat for PC {PCId}", request.PCId);
                return StatusCode(500, new HeartbeatResponse { Success = false });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during heartbeat for PC {PCId}", request.PCId);
                return StatusCode(500, new HeartbeatResponse { Success = false });
            }
        }
    }
}
