using LensAssemblyMonitoringWeb.Shared.Commands;
namespace LensAssemblyMonitoringWeb.Features.Updates.Commands
{

    public class CreateScheduleCommand : ICommand<CreateScheduleResult>
    {
        public int PackageId { get; }
        public string ScheduleName { get; }
        public string TargetType { get; }         
        public string? TargetFilter { get; }      
        public string CreatedBy { get; }

        public CreateScheduleCommand(
            int packageId,
            string scheduleName,
            string targetType,
            string? targetFilter,
            string createdBy)
        {
            if (packageId <= 0)
                throw new ArgumentException("PackageId must be positive", nameof(packageId));

            if (string.IsNullOrWhiteSpace(scheduleName))
                throw new ArgumentNullException(nameof(scheduleName));

            var validTargetTypes = new[] { "All", "ByVersion", "ByLine", "SelectedMCs" };
            if (!validTargetTypes.Contains(targetType))
                throw new ArgumentException($"TargetType must be one of: {string.Join(", ", validTargetTypes)}", nameof(targetType));

            if (string.IsNullOrWhiteSpace(createdBy))
                throw new ArgumentNullException(nameof(createdBy));

            PackageId = packageId;
            ScheduleName = scheduleName;
            TargetType = targetType;
            TargetFilter = targetFilter;
            CreatedBy = createdBy;
        }
    }

    public class CreateScheduleResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public int? ScheduleId { get; init; }
        public int? TargetCount { get; init; }

        public static CreateScheduleResult Succeeded(int scheduleId, int targetCount) => new()
        {
            Success = true,
            Message = $"Schedule created with {targetCount} target MCs",
            ScheduleId = scheduleId,
            TargetCount = targetCount
        };

        public static CreateScheduleResult PackageNotFound() => new()
        {
            Success = false,
            Message = "Package not found or has been deleted"
        };

        public static CreateScheduleResult NoTargetsResolved() => new()
        {
            Success = false,
            Message = "No MCs matched the target criteria"
        };

        public static CreateScheduleResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}



