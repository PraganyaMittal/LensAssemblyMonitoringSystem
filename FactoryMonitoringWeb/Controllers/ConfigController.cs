using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// Controller for configuration-related endpoints from the agent.
    /// </summary>
    [Route("api/agent/config")]
    [ApiController]
    public class ConfigController : ControllerBase
    {
        private readonly ILogger<ConfigController> _logger;

        public ConfigController(ILogger<ConfigController> logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Uploads configuration content back to the server from the agent.
        /// </summary>
        [HttpPost("upload")]
        [Consumes("application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
        public ActionResult<ApiResponse> UploadConfig([FromBody] ConfigUploadRequest request, [FromServices] IConfigService configService)
        {
            if (string.IsNullOrEmpty(request.RequestId))
            {
                return BadRequest(new ApiResponse { Success = false, Message = "RequestId is required." });
            }

            var completed = configService.CompleteConfigRequest(request.RequestId, request.ConfigContent, request.ErrorMessage);

            return Ok(new ApiResponse
            {
                Success = completed,
                Message = completed ? "Config received" : "Request not found or expired"
            });
        }
    }

    /// <summary>
    /// Request model for configuration upload.
    /// </summary>
    public class ConfigUploadRequest
    {
        public string RequestId { get; set; } = string.Empty;
        public string? ConfigContent { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
