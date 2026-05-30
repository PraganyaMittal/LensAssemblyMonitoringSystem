using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Features.Logs.Services;
using LensAssemblyMonitoringWeb.Features.Yield.Services;
using LensAssemblyMonitoringWeb.Shared.FileSystem;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace LensAssemblyMonitoringWeb.Features.Updates.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    public class LAIController : ControllerBase
    {
        private readonly ILAIService _laiService;
        private readonly ILogger<LAIController> _logger;

        public LAIController(ILAIService laiService, ILogger<LAIController> logger)
        {
            _laiService = laiService;
            _logger = logger;
        }

        /// <summary>
        /// Scans a shared network path for a Lens Assembly Installer (LAI) release.
        /// </summary>
        [HttpPost("scan")]
        [ProducesResponseType(typeof(LAIScanResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LAIScanResult>> ScanRelease(
            [FromBody] LAIScanRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath))
                return BadRequest(new ApiErrorResponse { Message = "Network path is required.", ErrorCode = "network_path_required" });

            _logger.LogInformation(
                "LAI scan requested for path: {Path}", request.NetworkPath);

            var result = await _laiService.ScanReleaseAsync(request.NetworkPath, request.ShareUsername, request.SharePassword, ct);

            if (!result.Success)
                return BadRequest(new ApiErrorResponse { Message = result.ErrorMessage ?? "LAI scan failed.", ErrorCode = "lai_scan_failed" });

            return Ok(result);
        }

        /// <summary>
        /// Registers a previously scanned LAI package into the system.
        /// </summary>
        [HttpPost("register")]
        [ProducesResponseType(typeof(LAIRegisterResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LAIRegisterResult>> RegisterAsync(
            [FromBody] LAIRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return BadRequest(new ApiErrorResponse { Message = "NetworkPath and Version are required.", ErrorCode = "missing_required_fields" });
            }
            _logger.LogInformation(
                "LAI register requested: v{Version}", request.Version);

            var result = await _laiService.RegisterAsync(request, ct);

            if (!result.Success)
                return BadRequest(new ApiErrorResponse { Message = result.ErrorMessage ?? "LAI registration failed.", ErrorCode = "lai_register_failed" });

            return Ok(result);
        }
    }

    /// <summary>
    /// Payload required to scan a shared network folder for a new Lens Assembly Installer (LAI) release.
    /// </summary>
    public class LAIScanRequest
    {
        /// <summary>
        /// Remote network share directory path where update LAI resides.
        /// </summary>
        /// <example>\\10.250.200.10\releases\lai-v2.1.0</example>
        public string NetworkPath { get; set; } = string.Empty;

        /// <summary>
        /// Optional credentials username to access the network share.
        /// </summary>
        /// <example>release_user</example>
        public string? ShareUsername { get; set; }

        /// <summary>
        /// Optional credentials password to access the network share.
        /// </summary>
        /// <example>s3cr3tP@ss</example>
        public string? SharePassword { get; set; }
    }
}


