using LensAssemblyMonitoringWeb.Shared.Commands;
using LensAssemblyMonitoringWeb.Features.Agents.Commands;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LensAssemblyMonitoringWeb.Features.Agents.Controllers
{

    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class CommandController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogger<CommandController> _logger;

        public CommandController(
            ICommandDispatcher dispatcher,
            ILogger<CommandController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Receives the execution result of a dispatched command from the Agent.
        /// </summary>
        /// <param name="request">The command result payload.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Success or failure API response.</returns>
        [HttpPost("commandresult")]
        [ProducesResponseType(typeof(CommandResultApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(CommandResultApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(CommandResultApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(CommandResultApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<CommandResultApiResponse>> CommandResult(
            [FromBody] CommandResultRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new CommandResultCommand(
                    request.CommandId,
                    request.Status,
                    request.ResultData,
                    request.ErrorMessage);

                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                if (!result.Success && result.Message == "Command not found")
                {
                    return NotFound(new CommandResultApiResponse { Success = false, Message = result.Message });
                }

                return Ok(new CommandResultApiResponse
                {
                    Success = result.Success,
                    Message = result.Message,
                    Data = result.AgentDeleted ? new CommandResultData { AgentDeleted = true } : null
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new CommandResultApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recording command result");
                return StatusCode(500, new CommandResultApiResponse { Success = false, Message = ex.Message });
            }
        }
    }
}



