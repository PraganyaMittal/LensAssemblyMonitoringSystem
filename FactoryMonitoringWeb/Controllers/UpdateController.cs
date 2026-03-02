using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Update;
using FactoryMonitoringWeb.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Controllers
{
    /// <summary>
    /// REST API for Update Management.
    /// Feature 1: Package Library — upload, list, download, soft-delete .zip packages.
    /// </summary>
    [Route("api/Updates")]
    [ApiController]
    public class UpdateController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly FactoryDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UpdateController> _logger;

        public UpdateController(
            ICommandDispatcher dispatcher,
            FactoryDbContext context,
            IWebHostEnvironment env,
            ILogger<UpdateController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _env = env ?? throw new ArgumentNullException(nameof(env));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        // ==========================================
        // Package Library Endpoints (Feature 1)
        // ==========================================

        /// <summary>
        /// List active packages with optional filtering and pagination.
        /// GET /api/Updates/packages?type=LAI&search=v4&page=1&pageSize=20
        /// </summary>
        [HttpGet("packages")]
        public async Task<ActionResult> GetPackages(
            string? type = null,
            string? search = null,
            int page = 1,
            int pageSize = 20,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var query = _context.UpdatePackages
                    .Where(p => p.IsActive)
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(type))
                    query = query.Where(p => p.PackageType == type);

                if (!string.IsNullOrWhiteSpace(search))
                    query = query.Where(p =>
                        p.PackageName.Contains(search) ||
                        p.Version.Contains(search) ||
                        (p.Description != null && p.Description.Contains(search)));

                var totalCount = await query.CountAsync(cancellationToken);

                var packages = await query
                    .OrderByDescending(p => p.UploadedDate)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(p => new
                    {
                        p.UpdatePackageId,
                        p.PackageName,
                        p.PackageType,
                        p.Version,
                        p.FileName,
                        p.FileSize,
                        p.FileHash,
                        p.Description,
                        p.UploadedBy,
                        p.UploadedDate
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new
                {
                    packages,
                    totalCount,
                    page,
                    pageSize
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing packages");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Upload a new .zip package.
        /// POST /api/Updates/packages/upload (multipart/form-data)
        /// </summary>
        [HttpPost("packages/upload")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult> UploadPackage(
            [FromForm] IFormFile file,
            [FromForm] string packageName,
            [FromForm] string packageType,
            [FromForm] string version,
            [FromForm] string? description,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new UploadPackageCommand(
                    file, packageName, packageType, version, description,
                    uploadedBy: "Operator" // TODO: Replace with authenticated user
                );

                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                if (!result.Success && result.Message.Contains("already exists"))
                {
                    return Conflict(new { success = false, message = result.Message });
                }

                if (!result.Success)
                {
                    return BadRequest(new { success = false, message = result.Message });
                }

                return Ok(new
                {
                    success = true,
                    message = result.Message,
                    packageId = result.PackageId
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading package");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Download a package file (used by both browser and agents).
        /// GET /api/Updates/packages/{id}/download
        /// </summary>
        [HttpGet("packages/{id}/download")]
        public async Task<IActionResult> DownloadPackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Package not found" });

                var fullPath = Path.Combine(_env.WebRootPath, package.StoragePath);
                if (!System.IO.File.Exists(fullPath))
                {
                    _logger.LogError("Package file not found on disk: {Path}", fullPath);
                    return NotFound(new { success = false, message = "Package file not found on disk" });
                }

                var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                return File(stream, "application/octet-stream", package.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Soft-delete a package (set IsActive = false).
        /// DELETE /api/Updates/packages/{id}
        /// </summary>
        [HttpDelete("packages/{id}")]
        public async Task<ActionResult> DeletePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Package not found" });

                // TODO (Feature 2): Check for active schedules before allowing delete
                // var hasActiveSchedules = await _context.UpdateSchedules
                //     .AnyAsync(s => s.UpdatePackageId == id && s.IsActive && 
                //         s.Status != "Completed" && s.Status != "Cancelled", cancellationToken);
                // if (hasActiveSchedules)
                //     return BadRequest(new { success = false, message = "Cannot delete — active schedules exist" });

                package.IsActive = false;
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} soft-deleted", id);

                return Ok(new { success = true, message = "Package deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
