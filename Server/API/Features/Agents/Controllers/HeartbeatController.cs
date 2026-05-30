using LensAssemblyMonitoringWeb.Shared.Commands;
using LensAssemblyMonitoringWeb.Features.Agents.Commands;
using LensAssemblyMonitoringWeb.Shared.Exceptions;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Features.Logs.Services;
using LensAssemblyMonitoringWeb.Features.Yield.Services;
using LensAssemblyMonitoringWeb.Shared.FileSystem;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LensAssemblyMonitoringWeb.Features.Agents.Controllers
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

        /// <summary>
        /// Accepts a heartbeat from an MC agent, returning any pending commands.
        /// </summary>
        /// <param name="request">The heartbeat payload.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Heartbeat response with pending commands if any.</returns>
        [HttpPost("heartbeat")]
        [ProducesResponseType(typeof(HeartbeatResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(HeartbeatResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(HeartbeatResponse), StatusCodes.Status500InternalServerError)]
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
            catch (LensAssemblyMonitoringException ex)
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

        /// <summary>
        /// Updates the currently active model information for an MC agent.
        /// </summary>
        /// <param name="request">The model update payload.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>API Response indicating success.</returns>
        [HttpPost("model")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> UpdateModel(
            [FromBody] UpdateModelRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new UpdateModelCommand(request);
                await _dispatcher.DispatchAsync(command, cancellationToken);
                return Ok(new ApiResponse { Success = true, Message = "Model updated successfully" });
            }
            catch (AgentNotFoundException ex)
            {
                _logger.LogWarning("UpdateModel for unknown PC {MCId}", ex.MCId);
                return NotFound(new ApiResponse { Success = false, Message = "PC not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during UpdateModel for PC {MCId}", request.MCId);
                return StatusCode(500, new ApiResponse { Success = false, Message = "Internal server error" });
            }
        }
    }
}



