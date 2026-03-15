using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace FactoryMonitoringWeb.Controllers
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
                "LAI register requested: v{Version} â†’ Line {Line}",
                request.Version, request.TargetLineNumber);

            var result = await _laiService.RegisterAndDeployAsync(request, ct);

            if (!result.Success)
                return BadRequest(new { error = result.ErrorMessage });

            return Ok(result);
        }

        
        
        
        

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

    
    
    

    public class LAIScanRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
    }
}

