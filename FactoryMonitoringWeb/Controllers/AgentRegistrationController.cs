using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Thin controller for agent registration endpoints.
    /// 
    /// Design Decision: Thin controller pattern because:
    /// 1. Single Responsibility - HTTP concerns only (model binding, response formatting)
    /// 2. No business logic - delegates to command dispatcher
    /// 3. Testability - integration tests focus on HTTP, unit tests on handlers
    /// 
    /// This controller replaces the monolithic AgentApiController's Register endpoint.
    /// Route is maintained for backward compatibility.
    /// </summary>
    [Route("api/agent")]
    [ApiController]
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
        /// Registers a new agent or updates an existing agent's registration.
        /// </summary>
        /// <param name="request">Registration request from the agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Registration response with PC ID</returns>
        /// <response code="200">Registration successful</response>
        /// <response code="400">Invalid request data</response>
        /// <response code="500">Internal server error</response>
        [HttpPost("register")]
        [ProducesResponseType(typeof(AgentRegistrationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AgentRegistrationResponse>> Register(
            [FromBody] AgentRegistrationRequest request,
            CancellationToken cancellationToken)
        {
            // ModelState is automatically validated by [ApiController] attribute
            try
            {
                var command = new RegisterAgentCommand(request);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                var response = new AgentRegistrationResponse
                {
                    Success = result.Success,
                    PCId = result.PCId,
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
                _logger.LogError(ex, "Registration failed for Line {Line}, PC {PC}",
                    ex.LineNumber, ex.PCNumber);
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
