using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Commands.Update
{

    public class CancelScheduleCommand : ICommand<CancelScheduleResult>
    {
        public int ScheduleId { get; }
        public string CancelledBy { get; }

        public CancelScheduleCommand(int scheduleId, string cancelledBy)
        {
            if (scheduleId <= 0)
                throw new ArgumentException("ScheduleId must be positive", nameof(scheduleId));
            if (string.IsNullOrWhiteSpace(cancelledBy))
                throw new ArgumentNullException(nameof(cancelledBy));

            ScheduleId = scheduleId;
            CancelledBy = cancelledBy;
        }
    }

    public class CancelScheduleResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public int CancelledCount { get; init; }

        public static CancelScheduleResult Succeeded(int cancelledCount) => new()
        {
            Success = true,
            Message = $"Schedule cancelled. {cancelledCount} queued deployments were cancelled.",
            CancelledCount = cancelledCount
        };

        public static CancelScheduleResult NotFound() => new()
        {
            Success = false,
            Message = "Schedule not found"
        };

        public static CancelScheduleResult AlreadyCompleted() => new()
        {
            Success = false,
            Message = "Schedule is already completed or cancelled"
        };

        public static CancelScheduleResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }

    public class CancelScheduleHandler : ICommandHandler<CancelScheduleCommand, CancelScheduleResult>
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<CancelScheduleHandler> _logger;

        public CancelScheduleHandler(FactoryDbContext context, ILogger<CancelScheduleHandler> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<CancelScheduleResult> HandleAsync(
            CancelScheduleCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
                throw new ArgumentNullException(nameof(command));

            try
            {
                var schedule = await _context.UpdateSchedules
                    .Include(s => s.Deployments)
                    .FirstOrDefaultAsync(s => s.UpdateScheduleId == command.ScheduleId, cancellationToken);

                if (schedule == null)
                    return CancelScheduleResult.NotFound();

                if (schedule.Status == "Completed" || schedule.Status == "Cancelled" ||
                    schedule.Status == "PartiallyCompleted")
                    return CancelScheduleResult.AlreadyCompleted();

                var queuedDeployments = schedule.Deployments
                    .Where(d => d.Status == "Queued")
                    .ToList();

                foreach (var deployment in queuedDeployments)
                {
                    deployment.Status = "Cancelled";
                    deployment.CompletedDateUtc = DateTime.UtcNow;
                }

                schedule.Status = "Cancelled";
                schedule.CancelledBy = command.CancelledBy;
                schedule.CancelledDateUtc = DateTime.UtcNow;

                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Schedule {Id} cancelled by {User}. {Count} queued deployments cancelled.",
                    command.ScheduleId, command.CancelledBy, queuedDeployments.Count);

                return CancelScheduleResult.Succeeded(queuedDeployments.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to cancel schedule {Id}", command.ScheduleId);
                return CancelScheduleResult.Failed($"Cancel failed: {ex.Message}");
            }
        }
    }
}

