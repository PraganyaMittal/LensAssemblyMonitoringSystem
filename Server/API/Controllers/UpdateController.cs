using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Update;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

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

        /// <summary>
        /// Retrieves a paginated list of active software update packages.
        /// </summary>
        [HttpGet("packages")]
        [ProducesResponseType(typeof(PagedUpdatePackagesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PagedUpdatePackagesResponse>> GetPackages(
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
                    .Select(p => new UpdatePackageDto
                    {
                        UpdatePackageId = p.UpdatePackageId,
                        PackageType = p.PackageType,
                        Version = p.Version,
                        FileName = p.FileName,
                        FileSize = p.FileSize,
                        FileHash = p.FileHash,
                        Description = p.Description,
                        UploadedBy = p.UploadedBy,
                        UploadedDate = p.UploadedDate
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new PagedUpdatePackagesResponse
                {
                    Packages = packages,
                    TotalCount = totalCount,
                    Page = page,
                    PageSize = pageSize
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing packages");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "packages_list_failed"
                });
            }
        }

        /// <summary>
        /// Streams a registered update package to agents during deployment.
        /// </summary>
        [HttpGet("packages/{id}/download")]
        [Produces("application/octet-stream", "application/json")]
        [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> DownloadPackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new ErrorResponse { Message = "Package not found", ErrorCode = "package_not_found" });

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
                    return NotFound(new ErrorResponse
                    {
                        Message = "Package file not found on disk",
                        ErrorCode = "package_file_missing"
                    });
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
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "package_download_failed"
                });
            }
        }

        /// <summary>
        /// Archives a software update package, preventing new schedules from using it.
        /// </summary>
        [HttpDelete("packages/{id}")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> DeletePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new ErrorResponse { Message = "Package not found", ErrorCode = "package_not_found" });

                var hasActiveSchedules = await _context.UpdateSchedules
                    .AnyAsync(s => s.UpdatePackageId == id && s.IsActive &&
                        s.Status != "Completed" && s.Status != "Cancelled" &&
                        s.Status != "PartiallyCompleted", cancellationToken);
                if (hasActiveSchedules)
                    return BadRequest(new ErrorResponse
                    {
                        Message = "Cannot archive active schedules reference this package",
                        ErrorCode = "active_schedule_reference"
                    });

                package.IsActive = false;
                package.ArchivedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} archived", id);

                return Ok(new BasicResponse { Success = true, Message = "Package moved to archive" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error archiving package {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "package_archive_failed"
                });
            }
        }

        /// <summary>
        /// Creates a new deployment schedule for an update package.
        /// </summary>
        [HttpPost("schedules")]
        [ProducesResponseType(typeof(ScheduleMutationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ScheduleMutationResponse>> CreateSchedule(
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
                    return BadRequest(new ErrorResponse { Message = result.Message, ErrorCode = "schedule_create_invalid" });

                return Ok(new ScheduleMutationResponse
                {
                    Success = true,
                    Message = result.Message,
                    ScheduleId = result.ScheduleId,
                    TargetCount = result.TargetCount
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ErrorResponse { Message = ex.Message, ErrorCode = "schedule_create_argument_invalid" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating schedule");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "schedule_create_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves a paginated list of update deployment schedules.
        /// </summary>
        [HttpGet("schedules")]
        [ProducesResponseType(typeof(PagedUpdateSchedulesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PagedUpdateSchedulesResponse>> GetSchedules(
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
                    .Select(s => new UpdateScheduleListItemDto
                    {
                        UpdateScheduleId = s.UpdateScheduleId,
                        ScheduleName = s.ScheduleName,
                        TargetType = s.TargetType,
                        TargetFilter = s.TargetFilter,
                        ScheduleType = s.ScheduleType,
                        Status = s.Status,
                        TotalTargetCount = s.TotalTargetCount,
                        CreatedBy = s.CreatedBy,
                        CreatedDateUtc = s.CreatedDateUtc,
                        DispatchedDateUtc = s.DispatchedDateUtc,
                        CompletedDateUtc = s.CompletedDateUtc,
                        HaltReason = s.HaltReason,
                        HaltedAtMCId = s.HaltedAtMCId,
                        IsRollback = s.IsRollback,
                        OriginalScheduleId = s.OriginalScheduleId,
                        PackageType = s.UpdatePackage != null ? s.UpdatePackage.PackageType : "",
                        PackageVersion = s.UpdatePackage != null ? s.UpdatePackage.Version : "",
                        
                        CompletedCount = s.Deployments.Count(d => d.Status == "Completed"),
                        FailedCount = s.Deployments.Count(d => d.Status == "Failed"),
                        InProgressCount = s.Deployments.Count(d =>
                            d.Status == "Dispatched" || d.Status == "Downloading" || d.Status == "Installing"),
                        QueuedCount = s.Deployments.Count(d => d.Status == "Queued"),
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new PagedUpdateSchedulesResponse
                {
                    Schedules = schedules,
                    TotalCount = totalCount,
                    Page = page,
                    PageSize = pageSize
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing schedules");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "schedules_list_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves detailed information about a specific deployment schedule.
        /// </summary>
        [HttpGet("schedules/{id}")]
        [ProducesResponseType(typeof(UpdateScheduleDetailResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<UpdateScheduleDetailResponse>> GetScheduleDetail(int id, CancellationToken cancellationToken)
        {
            try
            {
                var schedule = await _context.UpdateSchedules
                    .Include(s => s.UpdatePackage)
                    .Include(s => s.Deployments)
                        .ThenInclude(d => d.LensAssemblyMC)
                    .FirstOrDefaultAsync(s => s.UpdateScheduleId == id, cancellationToken);

                if (schedule == null)
                    return NotFound(new ErrorResponse { Message = "Schedule not found", ErrorCode = "schedule_not_found" });

                return Ok(new UpdateScheduleDetailResponse
                {
                    Schedule = new UpdateScheduleDetailDto
                    {
                        UpdateScheduleId = schedule.UpdateScheduleId,
                        ScheduleName = schedule.ScheduleName,
                        TargetType = schedule.TargetType,
                        TargetFilter = schedule.TargetFilter,
                        ScheduleType = schedule.ScheduleType,
                        Status = schedule.Status,
                        TotalTargetCount = schedule.TotalTargetCount,
                        CreatedBy = schedule.CreatedBy,
                        CreatedDateUtc = schedule.CreatedDateUtc,
                        DispatchedDateUtc = schedule.DispatchedDateUtc,
                        CompletedDateUtc = schedule.CompletedDateUtc,
                        CancelledBy = schedule.CancelledBy,
                        CancelledDateUtc = schedule.CancelledDateUtc,
                        HaltReason = schedule.HaltReason,
                        HaltedAtMCId = schedule.HaltedAtMCId,
                        IsRollback = schedule.IsRollback,
                        OriginalScheduleId = schedule.OriginalScheduleId,
                        PackageType = schedule.UpdatePackage?.PackageType,
                        PackageVersion = schedule.UpdatePackage?.Version
                    },
                    Deployments = schedule.Deployments.Select(d => new UpdateDeploymentDetailDto
                    {
                        UpdateDeploymentId = d.UpdateDeploymentId,
                        MCId = d.MCId,
                        LineNumber = d.LensAssemblyMC?.LineNumber,
                        MCNumber = d.LensAssemblyMC?.MCNumber,
                        Status = d.Status,
                        AttemptCount = d.AttemptCount,
                        MaxAttempts = d.MaxAttempts,
                        PreviousVersion = d.PreviousVersion,
                        ExecutionOrder = d.ExecutionOrder,
                        ReportedAgentVersion = d.ReportedAgentVersion,
                        ReportedServiceVersion = d.ReportedServiceVersion,
                        ReportedUpdaterVersion = d.ReportedUpdaterVersion,
                        StartedDateUtc = d.StartedDateUtc,
                        CompletedDateUtc = d.CompletedDateUtc,
                        ErrorMessage = d.ErrorMessage
                    }).OrderBy(d => d.LineNumber).ThenBy(d => d.MCNumber)
                    .ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting schedule detail {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "schedule_detail_failed"
                });
            }
        }

        /// <summary>
        /// Cancels an active update schedule and halts any pending deployments.
        /// </summary>
        [HttpPost("schedules/{id}/cancel")]
        [ProducesResponseType(typeof(ScheduleMutationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ScheduleMutationResponse>> CancelSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                var command = new CancelScheduleCommand(id, "Operator"); 
                var result = await _dispatcher.DispatchAsync(command, cancellationToken);

                if (!result.Success)
                    return BadRequest(new ErrorResponse { Message = result.Message, ErrorCode = "schedule_cancel_invalid" });

                return Ok(new ScheduleMutationResponse
                {
                    Success = true,
                    Message = result.Message,
                    CancelledCount = result.CancelledCount
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new ErrorResponse { Message = ex.Message, ErrorCode = "schedule_cancel_argument_invalid" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling schedule {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "schedule_cancel_failed"
                });
            }
        }

        /// <summary>
        /// Initiates a rollback for a previously completed or failed schedule.
        /// </summary>
        [HttpPost("schedules/{id}/rollback")]
        [ProducesResponseType(typeof(ScheduleMutationResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ScheduleMutationResponse>> RollbackSchedule(int id, CancellationToken cancellationToken)
        {
            try
            {
                var command = new Commands.Update.RollbackScheduleCommand(id, "Operator");
                var result = await _dispatcher.DispatchAsync<Commands.Update.RollbackScheduleResult>(command, cancellationToken);

                if (!result.Success)
                {
                    // Distinguish between "not found" and "validation failure"
                    if (result.Message == "Schedule not found")
                        return NotFound(new ErrorResponse { Message = result.Message, ErrorCode = "schedule_not_found" });

                    return BadRequest(new ErrorResponse { Message = result.Message, ErrorCode = "schedule_rollback_invalid" });
                }

                return Ok(new ScheduleMutationResponse
                {
                    Success = true,
                    Message = result.Message,
                    RollbackScheduleId = result.RollbackScheduleId,
                    TargetCount = result.TargetCount
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rolling back schedule {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "schedule_rollback_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves summary statistics for the software updates dashboard.
        /// </summary>
        [HttpGet("dashboard")]
        [ProducesResponseType(typeof(UpdateDashboardResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<UpdateDashboardResponse>> GetDashboard(CancellationToken cancellationToken)
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
                    .Select(s => new UpdateDashboardRecentScheduleDto
                    {
                        UpdateScheduleId = s.UpdateScheduleId,
                        ScheduleName = s.ScheduleName,
                        Status = s.Status,
                        TotalTargetCount = s.TotalTargetCount,
                        CreatedDateUtc = s.CreatedDateUtc,
                        PackageType = s.UpdatePackage != null ? s.UpdatePackage.PackageType : "",
                        PackageVersion = s.UpdatePackage != null ? s.UpdatePackage.Version : ""
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new UpdateDashboardResponse
                {
                    TotalPackages = totalPackages,
                    TotalSchedules = totalSchedules,
                    ActiveDeployments = activeDeployments,
                    CompletedDeployments = completedDeployments,
                    FailedDeployments = failedDeployments,
                    SuccessRate = successRate,
                    RecentSchedules = recentSchedules
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching dashboard stats");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "updates_dashboard_failed"
                });
            }
        }



        /// <summary>
        /// Retrieves a list of archived update packages pending permanent deletion.
        /// </summary>
        [HttpGet("packages/archived")]
        [ProducesResponseType(typeof(ArchivedPackagesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ArchivedPackagesResponse>> GetArchivedPackages(CancellationToken cancellationToken)
        {
            try
            {
                var retentionDays = 30;

                var packages = await _context.UpdatePackages
                    .Where(p => !p.IsActive && p.ArchivedDate != null)
                    .OrderByDescending(p => p.ArchivedDate)
                    .Select(p => new ArchivedUpdatePackageDto
                    {
                        UpdatePackageId = p.UpdatePackageId,
                        PackageType = p.PackageType,
                        Version = p.Version,
                        FileName = p.FileName,
                        FileSize = p.FileSize,
                        Description = p.Description,
                        UploadedBy = p.UploadedBy,
                        UploadedDate = p.UploadedDate,
                        ArchivedDate = p.ArchivedDate,
                        DaysUntilPurge = p.ArchivedDate.HasValue
                            ? Math.Max(0, retentionDays - (int)(DateTime.UtcNow - p.ArchivedDate.Value).TotalDays)
                            : retentionDays
                    })
                    .ToListAsync(cancellationToken);

                return Ok(new ArchivedPackagesResponse { Packages = packages, RetentionDays = retentionDays });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing archived packages");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "archived_packages_list_failed"
                });
            }
        }

        /// <summary>
        /// Restores an archived update package back to active status.
        /// </summary>
        [HttpPost("packages/{id}/restore")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> RestorePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new ErrorResponse { Message = "Archived package not found", ErrorCode = "archived_package_not_found" });

                var duplicate = await _context.UpdatePackages
                    .AnyAsync(p => p.PackageType == package.PackageType &&
                                   p.Version == package.Version &&
                                   p.IsActive, cancellationToken);
                if (duplicate)
                    return Conflict(new ErrorResponse
                    {
                        Message = $"An active package with {package.PackageType} v{package.Version} already exists",
                        ErrorCode = "active_package_conflict"
                    });

                package.IsActive = true;
                package.ArchivedDate = null;
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Package {Id} restored from archive", id);
                return Ok(new BasicResponse { Success = true, Message = "Package restored" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error restoring package {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "package_restore_failed"
                });
            }
        }

        /// <summary>
        /// Permanently deletes an archived update package and its related schedules.
        /// </summary>
        [HttpDelete("packages/{id}/purge")]
        [ProducesResponseType(typeof(BasicResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<BasicResponse>> PurgePackage(int id, CancellationToken cancellationToken)
        {
            try
            {
                var package = await _context.UpdatePackages
                    .FirstOrDefaultAsync(p => p.UpdatePackageId == id && !p.IsActive, cancellationToken);

                if (package == null)
                    return NotFound(new ErrorResponse { Message = "Archived package not found", ErrorCode = "archived_package_not_found" });

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
                return Ok(new BasicResponse { Success = true, Message = "Package permanently deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error purging package {Id}", id);
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = ex.Message,
                    ErrorCode = "package_purge_failed"
                });
            }
        }
    }

    public class CreateScheduleRequest
    {
        [Range(1, int.MaxValue)]
        public int PackageId { get; set; }

        [Required]
        [StringLength(200)]
        public string ScheduleName { get; set; } = string.Empty;

        [Required]
        [StringLength(30)]
        public string TargetType { get; set; } = "ByLine";

        public string? TargetFilter { get; set; }

        [Required]
        [StringLength(20)]
        public string ScheduleType { get; set; } = "Immediate";
    }
}

