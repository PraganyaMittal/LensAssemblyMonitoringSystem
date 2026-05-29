using LensAssemblyMonitoringWeb.Models.DTOs;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace LensAssemblyMonitoringWeb.Controllers
{

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
        /// Receives a configuration file upload from an agent.
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

    public class ConfigUploadRequest
    {
        public string RequestId { get; set; } = string.Empty;
        public string? ConfigContent { get; set; }
        public string? ErrorMessage { get; set; }
    }
}

