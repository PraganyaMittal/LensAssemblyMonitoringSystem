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
        public async Task<IActionResult> RegisterAsync(
            [FromBody] LAIRegisterRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.NetworkPath) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return BadRequest(new { Message = "NetworkPath and Version are required." });
            }
            _logger.LogInformation(
                "LAI register requested: v{Version}", request.Version);

            var result = await _laiService.RegisterAsync(request, ct);

            if (!result.Success)
                return BadRequest(new { error = result.ErrorMessage });

            return Ok(result);
        }
    }

    public class LAIScanRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
    }
}
