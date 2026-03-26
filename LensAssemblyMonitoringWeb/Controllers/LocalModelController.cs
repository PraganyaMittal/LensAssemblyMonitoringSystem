using LensAssemblyMonitoringWeb.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using System.IO.Compression;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using System.Text;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/localmodel")]
    [ApiController]
    public class LocalModelController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<LocalModelController> _logger;
        private readonly IWebHostEnvironment _env;

        public LocalModelController(
            LensAssemblyDbContext context,
            IHubContext<AgentHub> hubContext,
            ILogger<LocalModelController> logger,
            IWebHostEnvironment env)
        {
            _context = context;
            _hubContext = hubContext;
            _logger = logger;
            _env = env;
        }

        public class RequestEditModel
        {
            public int MCId { get; set; }
            public string ModelName { get; set; }
        }

        public class RequestEditResponse
        {
            public string SessionId { get; set; }
            public string UploadUrl { get; set; }
        }

        public class SessionStatusResponse
        {
            public string Status { get; set; } 
            public string[] Files { get; set; }
        }

        public class SaveFileRequest
        {
            public string Content { get; set; }
        }

        [HttpPost("request-edit")]
        public async Task<ActionResult<RequestEditResponse>> RequestEdit([FromBody] RequestEditModel request)
        {
            try
            {
                var sessionId = Guid.NewGuid().ToString();

                string baseUrl = $"{Request.Scheme}://{Request.Host}{Request.PathBase}";

                if (Request.Host.Host == "localhost" || Request.Host.Host == "127.0.0.1")
                {
                    var hostName = System.Net.Dns.GetHostName();
                    var ips = await System.Net.Dns.GetHostAddressesAsync(hostName);
                    var ipv4 = ips.FirstOrDefault(ip => ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                    if (ipv4 != null)
                    {
                        var port = Request.Host.Port ?? (Request.Scheme == "https" ? 443 : 80);
                        baseUrl = $"{Request.Scheme}://{ipv4}:{port}{Request.PathBase}";
                    }
                }

                var uploadUrl = $"{baseUrl}/api/localmodel/upload/{sessionId}";

                var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
                Directory.CreateDirectory(sessionDir);

                await System.IO.File.WriteAllTextAsync(Path.Combine(sessionDir, ".status"), "Pending");

                var commandData = new
                {
                    ModelName = request.ModelName,
                    UploadUrl = uploadUrl
                };

                var virtualCmdId = new Random().Next(10000, 99999);
                await _hubContext.Clients.Group(request.MCId.ToString())
                    .SendAsync("ReceiveCommand",
                        "UploadModelToLib",
                        JsonConvert.SerializeObject(commandData),
                        virtualCmdId.ToString());

                return Ok(new RequestEditResponse
                {
                    SessionId = sessionId,
                    UploadUrl = uploadUrl
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting edit");
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("upload/{sessionId}")]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> UploadStart(string sessionId, [FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0) return BadRequest("No file");

                var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
                if (!Directory.Exists(sessionDir)) return NotFound("Session expired or invalid");

                var zipPath = Path.Combine(sessionDir, "model.zip");
                
                using (var stream = new FileStream(zipPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                try 
                {
                    ZipFile.ExtractToDirectory(zipPath, sessionDir, overwriteFiles: true);
                    System.IO.File.Delete(zipPath); 

                    await System.IO.File.WriteAllTextAsync(Path.Combine(sessionDir, ".status"), "Ready");
                }
                catch (Exception ex)
                {
                    await System.IO.File.WriteAllTextAsync(Path.Combine(sessionDir, ".status"), $"Error: {ex.Message}");
                    throw;
                }

                return Ok(new { message = "Upload and extraction successful" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Upload failed");
                return StatusCode(500, ex.Message);
            }
        }

        [HttpGet("session/{sessionId}/status")]
        public async Task<ActionResult<SessionStatusResponse>> GetStatus(string sessionId)
        {
            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            if (!Directory.Exists(sessionDir)) return NotFound("Session not found");

            var statusFile = Path.Combine(sessionDir, ".status");
            string status = "Unknown";
            if (System.IO.File.Exists(statusFile))
            {
                status = await System.IO.File.ReadAllTextAsync(statusFile);
            }

            string[] files = Array.Empty<string>();
            if (status == "Ready")
            {
                
                files = Directory.GetFiles(sessionDir, "*.*", SearchOption.AllDirectories)
                    .Select(f => Path.GetRelativePath(sessionDir, f))
                    .Where(f => f != ".status")
                    .ToArray();
            }

            return Ok(new SessionStatusResponse { Status = status, Files = files });
        }

        [HttpGet("session/{sessionId}/file")]
        public async Task<IActionResult> GetFileContent(string sessionId, [FromQuery] string path)
        {
            if (string.IsNullOrEmpty(path)) return BadRequest("Path required");

            if (path.Contains("..") || Path.IsPathRooted(path)) return BadRequest("Invalid path");

            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            var filePath = Path.Combine(sessionDir, path);

            if (!System.IO.File.Exists(filePath)) return NotFound("File not found");

            var content = await System.IO.File.ReadAllTextAsync(filePath);
            return Ok(new { Content = content });
        }

        [HttpPost("session/{sessionId}/file")]
        public async Task<IActionResult> SaveFileContent(string sessionId, [FromQuery] string path, [FromBody] SaveFileRequest request)
        {
            if (string.IsNullOrEmpty(path)) return BadRequest("Path required");
            if (path.Contains("..") || Path.IsPathRooted(path)) return BadRequest("Invalid path");

            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            var filePath = Path.Combine(sessionDir, path);

            Directory.CreateDirectory(Path.GetDirectoryName(filePath));

            await System.IO.File.WriteAllTextAsync(filePath, request.Content);
            return Ok(new { message = "Saved" });
        }
    }
}

