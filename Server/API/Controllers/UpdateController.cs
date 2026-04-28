using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Update;
using LensAssemblyMonitoringWeb.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Controllers
{

    [Route("api/Updates")]
    [ApiController]
    public class UpdateController : ControllerBase
    {
        private readonly ICommandDispatcher _dispatcher;
        private readonly LensAssemblyDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UpdateController> _logger;

        public UpdateController(
            ICommandDispatcher dispatcher,
            LensAssemblyDbContext context,
            IWebHostEnvironment env,
            ILogger<UpdateController> logger)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _env = env ?? throw new ArgumentNullException(nameof(env));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

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
                {
                    query = query.Where(p =>
                        p.Version.Contains(search) ||
                        (p.Description != null && p.Description.Contains(search))
                    );
                }
                var totalCount = await query.CountAsync(cancellationToken);

                var packages = await query
                    .OrderByDescending(p => p.UploadedDate)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(p => new
                    {
                        p.UpdatePackageId,
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
        /// DEPRECATED: Bundles now come from shared network paths via BundleController.
        /// This endpoint is preserved for backward compatibility only.
        /// </summary>
        [Obsolete("Use BundleController.ScanRelease + RegisterAsync instead")]
        [HttpPost("packages/upload")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult> UploadPackage(
            [FromForm] IFormFile file,
            [FromForm] string packageType,
            [FromForm] string version,
            [FromForm] string? description,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new UploadPackageCommand(
                    file, packageType, version, description,
                    uploadedBy: "Operator" 
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
        /// DEPRECATED: Service now copies packages directly from shared paths.
        /// Agents no longer download packages from this endpoint.
        /// </summary>
        [Obsolete("Service copies from shared path directly — no HTTP download needed")]
        [HttpGet("packages/{id}/download")]
        public async Task<IActionResult> DownloadPackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Package not found" });

                var fullPath = package.StoragePath;
                if (!Path.IsPathRooted(fullPath))
                {
                    fullPath = Path.Combine(_env.WebRootPath, package.StoragePath);
                }
                if (!Path.HasExtension(fullPath))
                {
                    fullPath = Path.Combine(fullPath, package.FileName);
                }
                
                if (!System.IO.File.Exists(fullPath))
                {
                    _logger.LogError("Package file not found on disk: {Path}", fullPath);
                    return NotFound(new { success = false, message = "Package file not found on disk" });
                }

                var fileInfo = new FileInfo(fullPath);
                var fileLength = fileInfo.Length;

                var rangeHeader = Request.Headers["Range"].FirstOrDefault();
                if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
                {
                    var rangeValue = rangeHeader["bytes=".Length..];
                    var parts = rangeValue.Split('-');

                    if (long.TryParse(parts[0], out var rangeStart) && rangeStart < fileLength)
                    {
                        var rangeEnd = fileLength - 1;
                        if (parts.Length > 1 && long.TryParse(parts[1], out var parsedEnd))
                            rangeEnd = Math.Min(parsedEnd, fileLength - 1);

                        var contentLength = rangeEnd - rangeStart + 1;

                        var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                        stream.Seek(rangeStart, SeekOrigin.Begin);

                        Response.StatusCode = 206; 
                        Response.Headers["Accept-Ranges"] = "bytes";
                        Response.Headers["Content-Range"] = $"bytes {rangeStart}-{rangeEnd}/{fileLength}";
                        Response.Headers["Content-Length"] = contentLength.ToString();
                        Response.ContentType = "application/octet-stream";
                        Response.Headers["Content-Disposition"] = $"attachment; filename=\"{package.FileName}\"";

                        _logger.LogInformation(
                            "Resumable download: Package {Id}, bytes {Start}-{End}/{Total}",
                            id, rangeStart, rangeEnd, fileLength);

                        await stream.CopyToAsync(Response.Body, cancellationToken);
                        await stream.DisposeAsync();
                        return new EmptyResult();
                    }
                }

                Response.Headers["Accept-Ranges"] = "bytes";
                var fullStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                return File(fullStream, "application/octet-stream", package.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("packages/{id}")]
        public async Task<ActionResult> DeletePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Package not found" });

                var hasActiveSchedules = await _context.UpdateSchedules
                    .AnyAsync(s => s.UpdatePackageId == id && s.IsActive &&
                        s.Status != "Completed" && s.Status != "Cancelled" &&
                        s.Status != "PartiallyCompleted", cancellationToken);
                if (hasActiveSchedules)
                    return BadRequest(new { success = false, message = "Cannot archive active schedules reference this package" });

                package.IsActive = false;
                package.ArchivedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} archived", id);

                return Ok(new { success = true, message = "Package moved to archive" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error archiving package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("schedules")]
        public async Task<ActionResult> CreateSchedule(
            [FromBody] CreateScheduleRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var command = new CreateScheduleCommand(
                    request.PackageId,
                    request.ScheduleName,
                    request.TargetType,
                    request.TargetFilter,
                    createdBy: "Operator" 
                );

                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });

                return Ok(new
                {
                    success = true,
                    message = result.Message,
                    scheduleId = result.ScheduleId,
                    targetCount = result.TargetCount
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating schedule");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("schedules")]
        public async Task<ActionResult> GetSchedules(
            string? status = null,
            int page = 1,
            int pageSize = 20,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var query = _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .Where(s => s.IsActive)
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(status))
                    query = query.Where(s => s.Status == status);

                var totalCount = await query.CountAsync(cancellationToken);

                var schedules = await query
                    .OrderByDescending(s => s.CreatedDateUtc)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(s => new
                    {
                        s.UpdateScheduleId,
                        s.ScheduleName,
                        s.TargetType,
                        s.TargetFilter,
                        s.ScheduleType,
                        s.Status,
                        s.TotalTargetCount,
                        s.CreatedBy,
                        s.CreatedDateUtc,
                        s.DispatchedDateUtc,
                        s.CompletedDateUtc,
                        s.HaltReason,
                        s.HaltedAtMCId,
                        s.IsRollback,
                        s.OriginalScheduleId,
                        PackageType = s.UpdatePackage != null ? s.UpdatePackage.PackageType : "",
                        PackageVersion = s.UpdatePackage != null ? s.UpdatePackage.Version : "",
                        
                        CompletedCount = s.Deployments.Count(d => d.Status == "Completed"),
                        FailedCount = s.Deployments.Count(d => d.Status == "Failed"),
                        InProgressCount = s.Deployments.Count(d =>
                            d.Status == "Dispatched" || d.Status == "Downloading" || d.Status == "Installing"),
                        QueuedCount = s.Deployments.Count(d => d.Status == "Queued"),
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new
                {
                    schedules,
                    totalCount,
                    page,
                    pageSize
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing schedules");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("schedules/{id}")]
        public async Task<ActionResult> GetScheduleDetail(int id, CancellationToken cancellationToken)
        {
            try
            {
                var schedule = await _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .Include(s => s.Deployments)
                        .ThenInclude(d => d.LensAssemblyMC)
                    .FirstOrDefaultAsync(s => s.UpdateScheduleId == id, cancellationToken);

                if (schedule == null)
                    return NotFound(new { success = false, message = "Schedule not found" });

                return Ok(new
                {
                    schedule = new
                    {
                        schedule.UpdateScheduleId,
                        schedule.ScheduleName,
                        schedule.TargetType,
                        schedule.TargetFilter,
                        schedule.ScheduleType,
                        schedule.Status,
                        schedule.TotalTargetCount,
                        schedule.CreatedBy,
                        schedule.CreatedDateUtc,
                        schedule.DispatchedDateUtc,
                        schedule.CompletedDateUtc,
                        schedule.CancelledBy,
                        schedule.CancelledDateUtc,
                        schedule.HaltReason,
                        schedule.HaltedAtMCId,
                        schedule.IsRollback,
                        schedule.OriginalScheduleId,
                        PackageType = schedule.UpdatePackage?.PackageType,
                        PackageVersion = schedule.UpdatePackage?.Version
                    },
                    deployments = schedule.Deployments.Select(d => new
                    {
                        d.UpdateDeploymentId,
                        d.MCId,
                        LineNumber = d.LensAssemblyMC?.LineNumber,
                        MCNumber = d.LensAssemblyMC?.MCNumber,
                        d.Status,
                        d.AttemptCount,
                        d.MaxAttempts,
                        d.PreviousVersion,
                        d.ExecutionOrder,
                        d.ReportedAgentVersion,
                        d.ReportedServiceVersion,
                        d.ReportedUpdaterVersion,
                        d.StartedDateUtc,
                        d.CompletedDateUtc,
                        d.ErrorMessage
                    }).OrderBy(d => d.LineNumber).ThenBy(d => d.MCNumber)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting schedule detail {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("schedules/{id}/cancel")]
        public async Task<ActionResult> CancelSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                var command = new CancelScheduleCommand(id, "Operator"); 
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });

                return Ok(new
                {
                    success = true,
                    message = result.Message,
                    cancelledCount = result.CancelledCount
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling schedule {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("schedules/{id}/rollback")]
        public async Task<ActionResult> RollbackSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                var command = new Commands.Update.RollbackScheduleCommand(id, "Operator");
                var result = await _dispatcher.DispatchAsync<Commands.Update.RollbackScheduleResult>(command, cancellationToken);

                if (!result.Success)
                {
                    // Distinguish between "not found" and "validation failure"
                    if (result.Message == "Schedule not found")
                        return NotFound(new { success = false, message = result.Message });

                    return BadRequest(new { success = false, message = result.Message });
                }

                return Ok(new
                {
                    success = true,
                    message = result.Message,
                    rollbackScheduleId = result.RollbackScheduleId,
                    targetCount = result.TargetCount
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rolling back schedule {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("dashboard")]
        public async Task<ActionResult> GetDashboard(CancellationToken cancellationToken)
        {
            try
            {
                var totalPackages = await _context.UpdatePackages
                    .CountAsync(p => p.IsActive, cancellationToken);

                var totalSchedules = await _context.UpdateSchedules
                    .CountAsync(s => s.IsActive, cancellationToken);

                var deploymentStats = await _context.UpdateDeployments
                    .GroupBy(d => d.Status)
                    .Select(g => new { Status = g.Key, Count = g.Count() })
                    .ToListAsync(cancellationToken);

                var activeDeployments = deploymentStats
                    .Where(s => s.Status == "Queued" || s.Status == "Dispatched" || s.Status == "Downloading" || s.Status == "Installing")
                    .Sum(s => s.Count);

                var completedDeployments = deploymentStats
                    .Where(s => s.Status == "Completed")
                    .Sum(s => s.Count);

                var failedDeployments = deploymentStats
                    .Where(s => s.Status == "Failed")
                    .Sum(s => s.Count);

                var totalDeployments = deploymentStats.Sum(s => s.Count);
                var successRate = totalDeployments > 0
                    ? Math.Round((double)completedDeployments / (completedDeployments + failedDeployments) * 100, 1)
                    : 0;

                var recentSchedules = await _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .Where(s => s.IsActive)
                    .OrderByDescending(s => s.CreatedDateUtc)
                    .Take(5)
                    .Select(s => new
                    {
                        s.UpdateScheduleId,
                        s.ScheduleName,
                        s.Status,
                        s.TotalTargetCount,
                        CreatedDateUtc = s.CreatedDateUtc,
                        PackageType = s.UpdatePackage != null ? s.UpdatePackage.PackageType : "",
                        PackageVersion = s.UpdatePackage != null ? s.UpdatePackage.Version : ""
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new
                {
                    totalPackages,
                    totalSchedules,
                    activeDeployments,
                    completedDeployments,
                    failedDeployments,
                    successRate,
                    recentSchedules
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching dashboard stats");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }



        [HttpGet("packages/archived")]
        public async Task<ActionResult> GetArchivedPackages(CancellationToken cancellationToken)
        {
            try
            {
                var retentionDays = 30;

                var packages = await _context.UpdatePackages
                    .Where(p => !p.IsActive && p.ArchivedDate != null)
                    .OrderByDescending(p => p.ArchivedDate)
                    .Select(p => new
                    {
                        p.UpdatePackageId,
                        p.PackageType,
                        p.Version,
                        p.FileName,
                        p.FileSize,
                        p.Description,
                        p.UploadedBy,
                        p.UploadedDate,
                        p.ArchivedDate,
                        DaysUntilPurge = p.ArchivedDate.HasValue
                            ? Math.Max(0, retentionDays - (int)(DateTime.UtcNow - p.ArchivedDate.Value).TotalDays)
                            : retentionDays
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new { packages, retentionDays });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing archived packages");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("packages/{id}/restore")]
        public async Task<ActionResult> RestorePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Archived package not found" });

                var duplicate = await _context.UpdatePackages
                    .AnyAsync(p => p.PackageType == package.PackageType &&
                                   p.Version == package.Version &&
                                   p.IsActive, cancellationToken);
                if (duplicate)
                    return Conflict(new { success = false, message = $"An active package with {package.PackageType} v{package.Version} already exists" });

                package.IsActive = true;
                package.ArchivedDate = null;
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} restored from archive", id);
                return Ok(new { success = true, message = "Package restored" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error restoring package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("packages/{id}/purge")]
        public async Task<ActionResult> PurgePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Archived package not found" });

                var relatedSchedules = await _context.UpdateSchedules
                    .Include(s => s.Deployments)
                    .Where(s => s.UpdatePackageId == id)
                    .ToListAsync(cancellationToken);

                foreach (var schedule in relatedSchedules)
                {
                    if (schedule.Deployments.Any())
                        _context.UpdateDeployments.RemoveRange(schedule.Deployments);
                    _context.UpdateSchedules.Remove(schedule);
                }

                _context.UpdatePackages.Remove(package);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} permanently purged (with {ScheduleCount} schedules)", id, relatedSchedules.Count);
                return Ok(new { success = true, message = "Package permanently deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error purging package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class CreateScheduleRequest
    {
        public int PackageId { get; set; }
        public string ScheduleName { get; set; } = string.Empty;
        public string TargetType { get; set; } = "ByLine";
        public string? TargetFilter { get; set; }
        public string ScheduleType { get; set; } = "Immediate";
    }
}

