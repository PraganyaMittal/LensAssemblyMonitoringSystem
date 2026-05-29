using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace LensAssemblyMonitoringWeb.Controllers
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
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LAIScanResult>> ScanRelease(
            [FromBody] LAIScanRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath))
                return BadRequest(new ErrorOnlyResponse { Error = "Network path is required." });

            _logger.LogInformation(
                "LAI scan requested for path: {Path}", request.NetworkPath);

            var result = await _laiService.ScanReleaseAsync(request.NetworkPath, request.ShareUsername, request.SharePassword, ct);

            if (!result.Success)
                return BadRequest(new ErrorOnlyResponse { Error = result.ErrorMessage ?? "LAI scan failed." });

            return Ok(result);
        }

        /// <summary>
        /// Registers a previously scanned LAI package into the system.
        /// </summary>
        [HttpPost("register")]
        [ProducesResponseType(typeof(LAIRegisterResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(MessageOnlyResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LAIRegisterResult>> RegisterAsync(
            [FromBody] LAIRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return BadRequest(new MessageOnlyResponse { Message = "NetworkPath and Version are required." });
            }
            _logger.LogInformation(
                "LAI register requested: v{Version}", request.Version);

            var result = await _laiService.RegisterAsync(request, ct);

            if (!result.Success)
                return BadRequest(new ErrorOnlyResponse { Error = result.ErrorMessage ?? "LAI registration failed." });

            return Ok(result);
        }
    }

    public class LAIScanRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
        public string? ShareUsername { get; set; }
        public string? SharePassword { get; set; }
    }
}
