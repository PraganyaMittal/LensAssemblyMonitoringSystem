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
    /// Feature 2: Deployment Scheduling — create, list, detail, cancel schedules.
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
        /// Supports HTTP Range requests for resumable downloads.
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

                var fileInfo = new FileInfo(fullPath);
                var fileLength = fileInfo.Length;

                // Check for Range header (resumable download)
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

                        Response.StatusCode = 206; // Partial Content
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

                // Full download (no Range header)
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

        /// <summary>
        /// Soft-delete a package (set IsActive = false).
        /// Blocked if active schedules reference this package.
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

                // Check for active schedules before allowing archive
                var hasActiveSchedules = await _context.UpdateSchedules
                    .AnyAsync(s => s.UpdatePackageId == id && s.IsActive &&
                        s.Status != "Completed" && s.Status != "Cancelled" &&
                        s.Status != "PartiallyCompleted", cancellationToken);
                if (hasActiveSchedules)
                    return BadRequest(new { success = false, message = "Cannot archive — active schedules reference this package" });

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

        // ==========================================
        // Deployment Scheduling Endpoints (Feature 2)
        // ==========================================

        /// <summary>
        /// Create a deployment schedule.
        /// POST /api/Updates/schedules
        /// </summary>
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
                    request.ScheduleType,
                    request.ScheduledTimeUtc,
                    createdBy: "Operator" // TODO: Replace with authenticated user
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

        /// <summary>
        /// List schedules with optional status filter.
        /// GET /api/Updates/schedules?status=InProgress&page=1&pageSize=20
        /// </summary>
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
                        s.ScheduleType,
                        s.ScheduledTimeUtc,
                        s.Status,
                        s.TotalTargetCount,
                        s.CreatedBy,
                        s.CreatedDateUtc,
                        s.DispatchedDateUtc,
                        s.CompletedDateUtc,
                        PackageName = s.UpdatePackage != null ? s.UpdatePackage.PackageName : "",
                        PackageType = s.UpdatePackage != null ? s.UpdatePackage.PackageType : "",
                        PackageVersion = s.UpdatePackage != null ? s.UpdatePackage.Version : "",
                        // Aggregate counts from deployments
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

        /// <summary>
        /// Get schedule detail with deployments.
        /// GET /api/Updates/schedules/{id}
        /// </summary>
        [HttpGet("schedules/{id}")]
        public async Task<ActionResult> GetScheduleDetail(int id, CancellationToken cancellationToken)
        {
            try
            {
                var schedule = await _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .Include(s => s.Deployments)
                        .ThenInclude(d => d.FactoryMC)
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
                        schedule.ScheduledTimeUtc,
                        schedule.Status,
                        schedule.TotalTargetCount,
                        schedule.CreatedBy,
                        schedule.CreatedDateUtc,
                        schedule.DispatchedDateUtc,
                        schedule.CompletedDateUtc,
                        schedule.CancelledBy,
                        schedule.CancelledDateUtc,
                        PackageName = schedule.UpdatePackage?.PackageName,
                        PackageType = schedule.UpdatePackage?.PackageType,
                        PackageVersion = schedule.UpdatePackage?.Version
                    },
                    deployments = schedule.Deployments.Select(d => new
                    {
                        d.UpdateDeploymentId,
                        d.MCId,
                        LineNumber = d.FactoryMC?.LineNumber,
                        MCNumber = d.FactoryMC?.MCNumber,
                        d.Status,
                        d.AttemptCount,
                        d.MaxAttempts,
                        d.PreviousVersion,
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

        /// <summary>
        /// Cancel a deployment schedule.
        /// POST /api/Updates/schedules/{id}/cancel
        /// </summary>
        [HttpPost("schedules/{id}/cancel")]
        public async Task<ActionResult> CancelSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                var command = new CancelScheduleCommand(id, "Operator"); // TODO: Replace with authenticated user
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

        /// <summary>
        /// Rollback a completed/failed schedule.
        /// Creates a new reverse schedule targeting MCs that were successfully updated.
        /// POST /api/Updates/schedules/{id}/rollback
        /// </summary>
        [HttpPost("schedules/{id}/rollback")]
        public async Task<ActionResult> RollbackSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                // Load original schedule with package info
                var original = await _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .FirstOrDefaultAsync(s => s.UpdateScheduleId == id, cancellationToken);

                if (original == null)
                    return NotFound(new { success = false, message = "Schedule not found" });

                // Only allow rollback on terminal states
                var rollbackable = new[] { "Completed", "PartiallyCompleted", "Failed" };
                if (!rollbackable.Contains(original.Status))
                    return BadRequest(new { success = false, message = $"Cannot rollback schedule with status '{original.Status}'. Must be Completed, PartiallyCompleted, or Failed." });

                // Find MCs that were successfully updated (status = Completed)
                var completedDeployments = await _context.UpdateDeployments
                    .Include(d => d.FactoryMC)
                    .Where(d => d.UpdateScheduleId == id && d.Status == "Completed")
                    .ToListAsync(cancellationToken);

                if (!completedDeployments.Any())
                    return BadRequest(new { success = false, message = "No completed deployments to rollback." });

                // We need a package to deploy — use the same package (rollback command with PreviousVersion info)
                if (original.UpdatePackage == null || !original.UpdatePackage.IsActive)
                    return BadRequest(new { success = false, message = "Original package is no longer available." });

                // Create rollback schedule
                using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

                var rollbackSchedule = new Models.UpdateSchedule
                {
                    UpdatePackageId = original.UpdatePackageId,
                    ScheduleName = $"Rollback: {original.ScheduleName}",
                    TargetType = "SelectedMCs",
                    TargetFilter = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        mcIds = completedDeployments.Select(d => d.MCId).ToArray()
                    }),
                    ScheduleType = "Immediate",
                    Status = "InProgress",
                    TotalTargetCount = completedDeployments.Count,
                    CreatedBy = "Operator", // TODO: Replace with authenticated user
                    CreatedDateUtc = DateTime.UtcNow,
                    DispatchedDateUtc = DateTime.UtcNow,
                    IsActive = true
                };

                _context.UpdateSchedules.Add(rollbackSchedule);
                await _context.SaveChangesAsync(cancellationToken);

                // Create per-MC deployment rows for rollback
                var rollbackDeployments = completedDeployments.Select(d => new Models.UpdateDeployment
                {
                    UpdateScheduleId = rollbackSchedule.UpdateScheduleId,
                    MCId = d.MCId,
                    Status = "Queued",
                    AttemptCount = 0,
                    MaxAttempts = 3,
                    PreviousVersion = d.FactoryMC?.ModelVersion // Current version becomes rollback target
                }).ToList();

                _context.UpdateDeployments.AddRange(rollbackDeployments);
                await _context.SaveChangesAsync(cancellationToken);

                await transaction.CommitAsync(cancellationToken);

                _logger.LogInformation(
                    "Rollback schedule created: Id={Id}, rolling back {Count} MCs from schedule {OriginalId}",
                    rollbackSchedule.UpdateScheduleId, completedDeployments.Count, id);

                return Ok(new
                {
                    success = true,
                    message = $"Rollback initiated for {completedDeployments.Count} machines",
                    rollbackScheduleId = rollbackSchedule.UpdateScheduleId,
                    targetCount = completedDeployments.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rolling back schedule {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Dashboard stats for the Update Management system.
        /// GET /api/Updates/dashboard
        /// </summary>
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

                // Recent schedules (last 5)
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
                        s.CreatedDateUtc,
                        PackageName = s.UpdatePackage != null ? s.UpdatePackage.PackageName : "",
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

        /// <summary>
        /// List available MCs for target selection (grouped by line).
        /// GET /api/Updates/available-targets
        /// </summary>
        [HttpGet("available-targets")]
        public async Task<ActionResult> GetAvailableTargets(CancellationToken cancellationToken)
        {
            try
            {
                var targets = await _context.FactoryMCs
                    .OrderBy(mc => mc.LineNumber)
                    .ThenBy(mc => mc.MCNumber)
                    .Select(mc => new
                    {
                        mc.MCId,
                        mc.LineNumber,
                        mc.MCNumber,
                        mc.ModelVersion,
                        mc.IsOnline
                    })
                    .ToListAsync(cancellationToken);

                return Ok(targets);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing available targets");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ==========================================
        // Archive Endpoints
        // ==========================================

        /// <summary>
        /// List archived packages.
        /// GET /api/Updates/packages/archived
        /// </summary>
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
                        p.PackageName,
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

        /// <summary>
        /// Restore an archived package back to active.
        /// POST /api/Updates/packages/{id}/restore
        /// </summary>
        [HttpPost("packages/{id}/restore")]
        public async Task<ActionResult> RestorePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Archived package not found" });

                // Check for duplicate active package with same type+version
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

        /// <summary>
        /// Permanently delete an archived package (DB row + disk file).
        /// DELETE /api/Updates/packages/{id}/purge
        /// </summary>
        [HttpDelete("packages/{id}/purge")]
        public async Task<ActionResult> PurgePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new { success = false, message = "Archived package not found" });

                // Delete file from disk
                var fullPath = Path.Combine(_env.WebRootPath, package.StoragePath);
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                    _logger.LogInformation("Deleted file from disk: {Path}", fullPath);
                }

                // Hard delete from DB
                _context.UpdatePackages.Remove(package);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} permanently purged", id);
                return Ok(new { success = true, message = "Package permanently deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error purging package {Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    /// <summary>
    /// Request body for POST /api/Updates/schedules
    /// </summary>
    public class CreateScheduleRequest
    {
        public int PackageId { get; set; }
        public string ScheduleName { get; set; } = string.Empty;
        public string TargetType { get; set; } = "All";
        public string? TargetFilter { get; set; }
        public string ScheduleType { get; set; } = "Immediate";
        public DateTime? ScheduledTimeUtc { get; set; }
    }
}
