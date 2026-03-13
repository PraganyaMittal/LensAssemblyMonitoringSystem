using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// API controller for LAI software release management.
    /// 
    /// Endpoints:
    ///   POST /api/LAI/scan        — Read metadata from shared network path
    ///   POST /api/LAI/register    — Register release and deploy to a line
    ///   GET  /api/LAI/releases    — List LAI releases for a line
    /// </summary>
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

        // ────────────────────────────────────────────────────────────────
        // POST /api/LAI/scan
        // Reads release-info.json from the shared network path.
        // Returns parsed metadata for UI preview before registration.
        // ────────────────────────────────────────────────────────────────

        [HttpPost("scan")]
        public async Task<IActionResult> ScanRelease(
            [FromBody] LAIScanRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath))
                return BadRequest(new { error = "Network path is required." });

            _logger.LogInformation(
                "LAI scan requested for path: {Path}", request.NetworkPath);

            var result = await _laiService.ScanReleaseAsync(request.NetworkPath, ct);

            if (!result.Success)
                return BadRequest(new { error = result.ErrorMessage });

            return Ok(result);
        }

        // ────────────────────────────────────────────────────────────────
        // POST /api/LAI/register
        // Registers the scanned release and creates DeployLAI agent commands.
        // ────────────────────────────────────────────────────────────────

        [HttpPost("register")]
        public async Task<IActionResult> RegisterAndDeploy(
            [FromBody] LAIRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.Version))
                return BadRequest(new { error = "Version is required." });

            if (string.IsNullOrWhiteSpace(request.PackageName))
                return BadRequest(new { error = "Package name is required." });

            if (request.TargetLineNumber <= 0)
                return BadRequest(new { error = "Target line number is required." });

            _logger.LogInformation(
                "LAI register requested: v{Version} → Line {Line}",
                request.Version, request.TargetLineNumber);

            var result = await _laiService.RegisterAndDeployAsync(request, ct);

            if (!result.Success)
                return BadRequest(new { error = result.ErrorMessage });

            return Ok(result);
        }

        // ────────────────────────────────────────────────────────────────
        // GET /api/LAI/releases?lineNumber=1
        // Returns LAI release history for a specific line.
        // ────────────────────────────────────────────────────────────────

        [HttpGet("releases")]
        public async Task<IActionResult> GetReleases(
            [FromQuery] int lineNumber, CancellationToken ct)
        {
            if (lineNumber <= 0)
                return BadRequest(new { error = "Valid line number is required." });

            var releases = await _laiService.GetReleasesForLineAsync(lineNumber, ct);
            return Ok(releases);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Request DTO (scan only)
    // ────────────────────────────────────────────────────────────────

    public class LAIScanRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
    }
}
