using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace LensAssemblyMonitoringWeb.Controllers
{
    /// <summary>
    /// Bundle management endpoints — scan and register from shared network paths.
    /// Mirrors LAIController pattern. Replaces the old upload-based workflow.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class BundleController : ControllerBase
    {
        private readonly IBundleService _bundleService;
        private readonly ILogger<BundleController> _logger;

        public BundleController(IBundleService bundleService, ILogger<BundleController> logger)
        {
            _bundleService = bundleService;
            _logger = logger;
        }

        /// <summary>
        /// Scan a shared network path for a bundle release-info.json and validate the package.
        /// Returns version, file info, and computed SHA-256 hash.
        /// </summary>
        [HttpPost("scan")]
        [ProducesResponseType(typeof(BundleScanResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<BundleScanResult>> ScanRelease(
            [FromBody] BundleScanRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath))
                return BadRequest(new ErrorOnlyResponse { Error = "Network path is required." });

            _logger.LogInformation(
                "Bundle scan requested for path: {Path}", request.NetworkPath);

            var result = await _bundleService.ScanReleaseAsync(request.NetworkPath, request.ShareUsername, request.SharePassword, ct);

            if (!result.Success)
                return BadRequest(new ErrorOnlyResponse { Error = result.ErrorMessage ?? "Bundle scan failed." });

            return Ok(result);
        }

        /// <summary>
        /// Register a previously scanned bundle package into the Software Library.
        /// </summary>
        [HttpPost("register")]
        [ProducesResponseType(typeof(BundleRegisterResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorOnlyResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(MessageOnlyResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<BundleRegisterResult>> RegisterAsync(
            [FromBody] BundleRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return BadRequest(new MessageOnlyResponse { Message = "NetworkPath and Version are required." });
            }

            _logger.LogInformation(
                "Bundle register requested: v{Version}", request.Version);

            var result = await _bundleService.RegisterAsync(request, ct);

            if (!result.Success)
                return BadRequest(new ErrorOnlyResponse { Error = result.ErrorMessage ?? "Bundle registration failed." });

            return Ok(result);
        }
    }

    public class BundleScanRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
        public string? ShareUsername { get; set; }
        public string? SharePassword { get; set; }
    }
}
