using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Config;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for agent configuration endpoints.
    /// 
    /// Design Decision: CQRS pattern with separate endpoints:
    /// - POST /updateconfig - Command (Write side) - Agent syncs its config
    /// - GET /getconfigupdate/{pcId} - Query (Read side) - Agent checks for updates
    /// 
    /// Route maintained for backward compatibility with existing agents.
    /// </summary>
    [Route("api/agent")]
    [ApiController]
    public class ConfigController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogger<ConfigController> _logger;

        public ConfigController(
            ICommandDispatcher dispatcher,
            ILogger<ConfigController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Syncs agent's current config to the server (WRITE side).
        /// Agent calls this after applying config changes.
        /// </summary>
        /// <param name="request">Config update request from agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Sync result</returns>
        [HttpPost("updateconfig")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> UpdateConfig(
            [FromBody] ConfigUpdateRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new SyncConfigCommand(request.PCId, request.ConfigContent);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                return Ok(new ApiResponse
                {
                    Success = result.Success,
                    Message = result.Message
                });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning("Invalid config update request: {Message}", ex.Message);
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
            catch (FactoryMonitoringException ex)
            {
                _logger.LogError(ex, "Domain error during config sync");
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during config sync for PC {PCId}", request.PCId);
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = "Config update failed unexpectedly"
                });
            }
        }

        /// <summary>
        /// Checks if server has pending config update for agent (READ side).
        /// Agent polls this endpoint to check for new config.
        /// </summary>
        /// <param name="pcId">The PC ID to check</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Pending config info if available</returns>
        [HttpGet("getconfigupdate/{pcId}")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> GetConfigUpdate(
            int pcId,
            CancellationToken cancellationToken)
        {
            try
            {
                var query = new GetPendingConfigQuery(pcId);
                var result = await _dispatcher.DispatchAsync(query, cancellationToken);

                if (!result.HasPendingUpdate)
                {
                    return Ok(new ApiResponse
                    {
                        Success = true,
                        Message = "No pending update",
                        Data = null
                    });
                }

                return Ok(new ApiResponse
                {
                    Success = true,
                    Message = "Config update available",
                    Data = new
                    {
                        UpdatedContent = result.UpdatedContent,
                        UpdateRequestTime = result.UpdateRequestTime
                    }
                });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning("Invalid config query: {Message}", ex.Message);
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking pending config for PC {PCId}", pcId);
                return StatusCode(500, new ApiResponse
                {
                    Success = false,
                    Message = "Failed to check pending config"
                });
            }
        }
    }
}
