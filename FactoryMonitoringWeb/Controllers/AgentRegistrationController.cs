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

        [HttpPost("register")]
        [ProducesResponseType(typeof(AgentRegistrationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
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
                return BadRequest(ex.ToErrorResponse());
            }
            catch (RegistrationFailedException ex)
            {
                _logger.LogError(ex, "Registration failed for Line {Line}, MC {MCNumber}",
                    ex.LineNumber, ex.MCNumber);
                return StatusCode(500, ex.ToErrorResponse());
            }
            catch (FactoryMonitoringException ex)
            {
                _logger.LogError(ex, "Domain error during registration");
                return StatusCode(500, ex.ToErrorResponse());
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

