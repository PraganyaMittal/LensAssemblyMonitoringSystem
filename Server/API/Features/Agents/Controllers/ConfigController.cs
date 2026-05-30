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

namespace LensAssemblyMonitoringWeb.Features.Agents.Controllers
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



