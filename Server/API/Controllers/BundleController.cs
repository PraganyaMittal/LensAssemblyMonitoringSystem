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
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<BundleScanResult>> ScanRelease(
            [FromBody] BundleScanRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath))
                return BadRequest(new ApiErrorResponse { Message = "Network path is required.", ErrorCode = "network_path_required" });

            _logger.LogInformation(
                "Bundle scan requested for path: {Path}", request.NetworkPath);

            var result = await _bundleService.ScanReleaseAsync(request.NetworkPath, request.ShareUsername, request.SharePassword, ct);

            if (!result.Success)
                return BadRequest(new ApiErrorResponse { Message = result.ErrorMessage ?? "Bundle scan failed.", ErrorCode = "bundle_scan_failed" });

            return Ok(result);
        }

        /// <summary>
        /// Register a previously scanned bundle package into the Software Library.
        /// </summary>
        [HttpPost("register")]
        [ProducesResponseType(typeof(BundleRegisterResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<BundleRegisterResult>> RegisterAsync(
            [FromBody] BundleRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return BadRequest(new ApiErrorResponse { Message = "NetworkPath and Version are required.", ErrorCode = "missing_required_fields" });
            }

            _logger.LogInformation(
                "Bundle register requested: v{Version}", request.Version);

            var result = await _bundleService.RegisterAsync(request, ct);

            if (!result.Success)
                return BadRequest(new ApiErrorResponse { Message = result.ErrorMessage ?? "Bundle registration failed.", ErrorCode = "bundle_register_failed" });

            return Ok(result);
        }
    }

    /// <summary>
    /// Payload required to scan a shared network folder for a new Software Bundle release.
    /// </summary>
    public class BundleScanRequest
    {
        /// <summary>
        /// Remote network share directory path where update bundle resides.
        /// </summary>
        /// <example>\\10.250.200.10\releases\bundle-v1.2.5</example>
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
