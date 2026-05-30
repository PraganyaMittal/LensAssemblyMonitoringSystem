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
    public class AgentRegistrationController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogger<AgentRegistrationController> _logger;

        public AgentRegistrationController(
            ICommandDispatcher dispatcher,
            ILogger<AgentRegistrationController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Registers a new Machine Controller (MC) agent or updates an existing one on startup.
        /// </summary>
        /// <param name="request">The registration payload.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Registration response with assigned MCId.</returns>
        [HttpPost("register")]
        [ProducesResponseType(typeof(AgentRegistrationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(AgentRegistrationResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(AgentRegistrationResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AgentRegistrationResponse>> Register(
            [FromBody] AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            
            try
            {
                var command = new RegisterAgentCommand(request);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                var response = new AgentRegistrationResponse
                {
                    Success = result.Success,
                    MCId = result.MCId,
                    LineNumber = result.LineNumber,
                    MCNumber = result.MCNumber,
                    Message = result.Message
                };

                if (result.Success)
                {
                    return Ok(response);
                }
                else
                {
                    return BadRequest(response);
                }
            }
            catch (DomainValidationException ex)
            {
                _logger.LogWarning("Validation failed for registration: {Errors}", ex.ValidationErrors);
                return BadRequest(new AgentRegistrationResponse { Success = false, Message = ex.Message });
            }
            catch (RegistrationFailedException ex)
            {
                _logger.LogError(ex, "Registration failed for Line {Line}, MC {MCNumber}",
                    ex.LineNumber, ex.MCNumber);
                return StatusCode(500, new AgentRegistrationResponse { Success = false, Message = ex.Message });
            }
            catch (LensAssemblyMonitoringException ex)
            {
                _logger.LogError(ex, "Domain error during registration");
                return StatusCode(500, new AgentRegistrationResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during agent registration");
                return StatusCode(500, new AgentRegistrationResponse
                {
                    Success = false,
                    Message = "An unexpected error occurred during registration"
                });
            }
        }
    }
}



