namespace LensAssemblyMonitoringWeb.Commands.Update
{
    /// <summary>
    /// Command to create a rollback schedule for a previously completed deployment.
    /// Follows CQRS pattern — encapsulates the rollback request with validation.
    /// </summary>
    public class RollbackScheduleCommand : ICommand<RollbackScheduleResult>
    {
        public int OriginalScheduleId { get; }
        public string RequestedBy { get; }

        public RollbackScheduleCommand(int originalScheduleId, string requestedBy)
        {
            if (originalScheduleId <= 0)
                throw new ArgumentException("OriginalScheduleId must be positive", nameof(originalScheduleId));

            if (string.IsNullOrWhiteSpace(requestedBy))
                throw new ArgumentNullException(nameof(requestedBy));

            OriginalScheduleId = originalScheduleId;
            RequestedBy = requestedBy;
        }
    }

    /// <summary>
    /// Result of a rollback schedule creation attempt.
    /// Uses static factory methods for clean, self-documenting result construction.
    /// </summary>
    public class RollbackScheduleResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public int? RollbackScheduleId { get; init; }
        public int? TargetCount { get; init; }

        public static RollbackScheduleResult Succeeded(int scheduleId, int targetCount) => new()
        {
            Success = true,
            Message = $"Rollback initiated for {targetCount} machines",
            RollbackScheduleId = scheduleId,
            TargetCount = targetCount
        };

        public static RollbackScheduleResult ScheduleNotFound() => new()
        {
            Success = false,
            Message = "Schedule not found"
        };

        public static RollbackScheduleResult InvalidStatus(string currentStatus) => new()
        {
            Success = false,
            Message = $"Cannot rollback schedule with status '{currentStatus}'. Must be Completed, PartiallyCompleted, Failed, or Halted."
        };

        public static RollbackScheduleResult AlreadyExists() => new()
        {
            Success = false,
            Message = "A rollback for this schedule already exists."
        };

        public static RollbackScheduleResult NoCompletedDeployments() => new()
        {
            Success = false,
            Message = "No completed deployments to rollback."
        };

        public static RollbackScheduleResult LineInProgress(int lineNumber) => new()
        {
            Success = false,
            Message = $"Cannot rollback: Line {lineNumber} has an active deployment in progress. Wait for it to complete."
        };

        public static RollbackScheduleResult PackageUnavailable() => new()
        {
            Success = false,
            Message = "Original package is no longer available."
        };

        public static RollbackScheduleResult ConcurrencyConflict() => new()
        {
            Success = false,
            Message = "Another operation modified this schedule. Please try again."
        };

        public static RollbackScheduleResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}
