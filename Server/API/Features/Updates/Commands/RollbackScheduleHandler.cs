using LensAssemblyMonitoringWeb.Shared.Commands;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Features.Updates.Commands
{
    /// <summary>
    /// Handles rollback schedule creation with:
    ///   1. Schedule eligibility validation
    ///   2. Line-level concurrency guard (one operation per line at a time)
    ///   3. Duplicate rollback prevention
    ///   4. Optimistic concurrency with RowVersion + retry loop
    ///   5. Ascending machine order (same as update)
    /// </summary>
    public class RollbackScheduleHandler : ICommandHandler<RollbackScheduleCommand, RollbackScheduleResult>
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<RollbackScheduleHandler> _logger;

        private const int MaxRetries = 3;

        private static readonly string[] RollbackEligibleStatuses =
            { "Completed", "PartiallyCompleted", "Failed", "Halted" };

        public RollbackScheduleHandler(
            LensAssemblyDbContext context,
            ILogger<RollbackScheduleHandler> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<RollbackScheduleResult> HandleAsync(
            RollbackScheduleCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
                throw new ArgumentNullException(nameof(command));

            // Optimistic concurrency with retry loop (replaces SERIALIZABLE isolation)
            for (int attempt = 1; attempt <= MaxRetries; attempt++)
            {
                try
                {
                    return await ExecuteRollbackAsync(command, cancellationToken);
                }
                catch (DbUpdateConcurrencyException ex)
                {
                    _logger.LogWarning(
                        "Concurrency conflict on rollback attempt {Attempt}/{Max} for schedule {Id}: {Error}",
                        attempt, MaxRetries, command.OriginalScheduleId, ex.Message);

                    if (attempt == MaxRetries)
                    {
                        return RollbackScheduleResult.ConcurrencyConflict();
                    }

                    // Detach all tracked entities so we get fresh data on retry
                    foreach (var entry in _context.ChangeTracker.Entries())
                    {
                        entry.State = EntityState.Detached;
                    }

                    await Task.Delay(100 * attempt, cancellationToken); // Exponential backoff
                }
            }

            return RollbackScheduleResult.Failed("Unexpected retry exhaustion");
        }

        private async Task<RollbackScheduleResult> ExecuteRollbackAsync(
            RollbackScheduleCommand command,
            CancellationToken ct)
        {
            // ── Step 1: Load and validate original schedule ──
            var original = await _context.UpdateSchedules
                .Include(s => s.UpdatePackage)
                .FirstOrDefaultAsync(s => s.UpdateScheduleId == command.OriginalScheduleId, ct);

            if (original == null)
            {
                _logger.LogWarning("Rollback target schedule {Id} not found", command.OriginalScheduleId);
                return RollbackScheduleResult.ScheduleNotFound();
            }

            // ── Step 2: Validate schedule is rollback-eligible ──
            if (!RollbackEligibleStatuses.Contains(original.Status))
            {
                _logger.LogWarning(
                    "Schedule {Id} has status '{Status}' — not eligible for rollback",
                    command.OriginalScheduleId, original.Status);
                return RollbackScheduleResult.InvalidStatus(original.Status);
            }

            // ── Step 3: Prevent duplicate rollback ──
            var existingRollback = await _context.UpdateSchedules
                .AnyAsync(s => s.OriginalScheduleId == command.OriginalScheduleId
                            && s.IsRollback
                            && s.IsActive
                            && s.Status != "Cancelled", ct);

            if (existingRollback)
            {
                _logger.LogWarning(
                    "Rollback already exists for schedule {Id}", command.OriginalScheduleId);
                return RollbackScheduleResult.AlreadyExists();
            }

            // ── Step 4: Load completed deployments (rollback targets) ──
            var completedDeployments = await _context.UpdateDeployments
                .Include(d => d.LensAssemblyMC)
                .Where(d => d.UpdateScheduleId == command.OriginalScheduleId
                         && d.Status == "Completed")
                .ToListAsync(ct);

            if (!completedDeployments.Any())
            {
                _logger.LogWarning("No completed deployments for schedule {Id}", command.OriginalScheduleId);
                return RollbackScheduleResult.NoCompletedDeployments();
            }

            // ── Step 5: Line-level concurrency guard ──
            // One operation per line at a time — reject if any InProgress schedule targets the same line
            var targetLineNumbers = completedDeployments
                .Select(d => d.LensAssemblyMC?.LineNumber)
                .Where(ln => ln.HasValue)
                .Select(ln => ln!.Value)
                .Distinct()
                .ToList();

            var activeScheduleIds = await _context.UpdateSchedules
                .Where(s => s.IsActive && s.Status == "InProgress")
                .Select(s => s.UpdateScheduleId)
                .ToListAsync(ct);

            if (activeScheduleIds.Any())
            {
                var activeLines = await _context.UpdateDeployments
                    .Include(d => d.LensAssemblyMC)
                    .Where(d => activeScheduleIds.Contains(d.UpdateScheduleId))
                    .Select(d => d.LensAssemblyMC!.LineNumber)
                    .Distinct()
                    .ToListAsync(ct);

                var conflictingLine = targetLineNumbers.Intersect(activeLines).FirstOrDefault();
                if (conflictingLine > 0)
                {
                    _logger.LogWarning(
                        "Line {Line} has an active InProgress schedule. Blocking rollback for schedule {Id}",
                        conflictingLine, command.OriginalScheduleId);
                    return RollbackScheduleResult.LineInProgress(conflictingLine);
                }
            }

            // ── Step 6: Validate package is still available ──
            if (original.UpdatePackage == null || !original.UpdatePackage.IsActive)
            {
                return RollbackScheduleResult.PackageUnavailable();
            }

            // ── Step 7: Create rollback schedule + deployments in transaction ──
            using var transaction = await _context.Database.BeginTransactionAsync(ct);

            var rollbackSchedule = new UpdateSchedule
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
                CreatedBy = command.RequestedBy,
                CreatedDateUtc = DateTime.UtcNow,
                DispatchedDateUtc = DateTime.UtcNow,
                IsActive = true,
                IsRollback = true,
                OriginalScheduleId = command.OriginalScheduleId
            };

            _context.UpdateSchedules.Add(rollbackSchedule);
            await _context.SaveChangesAsync(ct);

            // Sort by line number, then MC number (ascending — same as update)
            var sortedDeployments = completedDeployments
                .OrderBy(d => d.LensAssemblyMC?.LineNumber ?? 0)
                .ThenBy(d => d.LensAssemblyMC?.MCNumber ?? 0)
                .ToList();

            var rollbackDeployments = sortedDeployments.Select((d, index) => new UpdateDeployment
            {
                UpdateScheduleId = rollbackSchedule.UpdateScheduleId,
                MCId = d.MCId,
                Status = "Queued",
                AttemptCount = 0,
                MaxAttempts = 3,
                PreviousVersion = d.PreviousVersion,
                ExecutionOrder = index + 1
            }).ToList();

            _context.UpdateDeployments.AddRange(rollbackDeployments);
            await _context.SaveChangesAsync(ct);

            await transaction.CommitAsync(ct);

            _logger.LogInformation(
                "Rollback schedule created: Id={Id}, rolling back {Count} MCs from schedule {OriginalId}",
                rollbackSchedule.UpdateScheduleId, completedDeployments.Count, command.OriginalScheduleId);

            return RollbackScheduleResult.Succeeded(
                rollbackSchedule.UpdateScheduleId,
                completedDeployments.Count);
        }
    }
}



