using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using System.IO.Compression;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using LensAssemblyMonitoringWeb.Models.DTOs;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/localmodel")]
    [ApiController]
    public class LocalModelController : ControllerBase
    {
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<LocalModelController> _logger;
        private readonly IWebHostEnvironment _env;

        public LocalModelController(
            IHubContext<AgentHub> hubContext,
            ILogger<LocalModelController> logger,
            IWebHostEnvironment env)
        {
            _hubContext = hubContext;
            _logger = logger;
            _env = env;
        }

        public class RequestEditModel
        {
            public int MCId { get; set; }
            public string ModelName { get; set; } = string.Empty;
        }

        public class RequestEditResponse
        {
            public string SessionId { get; set; } = string.Empty;
            public string UploadUrl { get; set; } = string.Empty;
        }

        public class SessionStatusResponse
        {
            public string Status { get; set; } = string.Empty;
            public string[] Files { get; set; } = Array.Empty<string>();
        }

        public class SaveFileRequest
        {
            public string Content { get; set; } = string.Empty;
        }

        /// <summary>
        /// Requests a live edit session for a specific local model on an agent.
        /// </summary>
        [HttpPost("request-edit")]
        [ProducesResponseType(typeof(RequestEditResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
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
                return StatusCode(500, new ApiErrorResponse { Message = ex.Message, ErrorCode = "request_edit_error" });
            }
        }

        /// <summary>
        /// Uploads a model snapshot from an agent for a live edit session.
        /// </summary>
        [HttpPost("upload/{sessionId}")]
        [Consumes("multipart/form-data")]
        [DisableRequestSizeLimit]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ApiResponse>> UploadStart(string sessionId, IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0) return BadRequest(new ApiErrorResponse { Message = "No file provided", ErrorCode = "file_required" });

                var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
                if (!Directory.Exists(sessionDir)) return NotFound(new ApiErrorResponse { Message = "Session expired or invalid", ErrorCode = "session_not_found" });

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

                return Ok(new ApiResponse { Success = true, Message = "Upload and extraction successful" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Upload failed");
                return StatusCode(500, new ApiErrorResponse { Message = ex.Message, ErrorCode = "upload_error" });
            }
        }

        /// <summary>
        /// Retrieves the status and file tree of an active live edit session.
        /// </summary>
        [HttpGet("session/{sessionId}/status")]
        [ProducesResponseType(typeof(SessionStatusResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SessionStatusResponse>> GetStatus(string sessionId)
        {
            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            if (!Directory.Exists(sessionDir)) return NotFound(new ApiErrorResponse { Message = "Session not found", ErrorCode = "session_not_found" });

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

        /// <summary>
        /// Gets the text content of a specific file in a live edit session.
        /// </summary>
        [HttpGet("session/{sessionId}/file")]
        [ProducesResponseType(typeof(FileContentResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<FileContentResponse>> GetFileContent(string sessionId, [FromQuery] string path)
        {
            if (string.IsNullOrEmpty(path)) return BadRequest(new ApiErrorResponse { Message = "Path is required", ErrorCode = "path_required" });

            if (path.Contains("..") || Path.IsPathRooted(path)) return BadRequest(new ApiErrorResponse { Message = "Invalid path", ErrorCode = "path_traversal_blocked" });

            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            var filePath = Path.Combine(sessionDir, path);

            if (!System.IO.File.Exists(filePath)) return NotFound(new ApiErrorResponse { Message = "File not found in session", ErrorCode = "session_file_not_found" });

            var content = await System.IO.File.ReadAllTextAsync(filePath);
            return Ok(new FileContentResponse { Content = content });
        }

        /// <summary>
        /// Saves changes to a specific file in a live edit session.
        /// </summary>
        [HttpPost("session/{sessionId}/file")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<ApiResponse>> SaveFileContent(string sessionId, [FromQuery] string path, [FromBody] SaveFileRequest request)
        {
            if (string.IsNullOrEmpty(path)) return BadRequest(new ApiErrorResponse { Message = "Path is required", ErrorCode = "path_required" });
            if (path.Contains("..") || Path.IsPathRooted(path)) return BadRequest(new ApiErrorResponse { Message = "Invalid path", ErrorCode = "path_traversal_blocked" });

            var sessionDir = Path.Combine(_env.WebRootPath, "temp_sessions", sessionId);
            var filePath = Path.Combine(sessionDir, path);

            Directory.CreateDirectory(Path.GetDirectoryName(filePath) ?? sessionDir);

            await System.IO.File.WriteAllTextAsync(filePath, request.Content);
            return Ok(new ApiResponse { Success = true, Message = "Saved" });
        }
    }
}

