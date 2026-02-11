using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Model;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for model sync endpoint.
    /// </summary>
    [Route("api/agent")]
    [ApiController]
    [EnableRateLimiting("agent")]
    public class ModelController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly ILogger<ModelController> _logger;

        public ModelController(
            ICommandDispatcher dispatcher,
            ILogger<ModelController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Syncs models from agent.
        /// </summary>
        [HttpPost("syncmodels")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> SyncModels(
            [FromBody] ModelSyncRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var modelInfos = request.Models.Select(m => new ModelSyncInfo
                {
                    ModelName = m.ModelName,
                    ModelPath = m.ModelPath,
                    IsCurrent = m.IsCurrent
                });

                var command = new SyncModelsCommand(request.MCId, modelInfos);
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                return Ok(new ApiResponse
                {
                    Success = result.Success,
                    Message = result.Message,
                    Data = new
                    {
                        Inserted = result.InsertedCount,
                        Updated = result.UpdatedCount,
                        Removed = result.RemovedCount,
                        CurrentModel = result.CurrentModelName
                    }
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing models");
                return StatusCode(500, new ApiResponse { Success = false, Message = ex.Message });
            }
        }
    }
}
