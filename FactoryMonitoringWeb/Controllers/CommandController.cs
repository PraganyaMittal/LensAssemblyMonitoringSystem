using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FactoryMonitoringWeb.Controllers
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

        [HttpPost("commandresult")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> CommandResult(
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
                    return NotFound(new ApiResponse { Success = false, Message = result.Message });
                }

                return Ok(new ApiResponse
                {
                    Success = result.Success,
                    Message = result.Message,
                    Data = result.AgentDeleted ? new { AgentDeleted = true } : null
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recording command result");
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }
    }
}

