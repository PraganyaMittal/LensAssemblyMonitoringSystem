using LensAssemblyMonitoringWeb.Shared.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Updates.Contracts
{
    public class UpdatePackageDto
        {
            public int UpdatePackageId { get; set; }
            public string PackageType { get; set; } = string.Empty;
            public string Version { get; set; } = string.Empty;
            public string FileName { get; set; } = string.Empty;
            public long FileSize { get; set; }
            public string FileHash { get; set; } = string.Empty;
            public string? Description { get; set; }
            public string UploadedBy { get; set; } = string.Empty;
            public DateTime UploadedDate { get; set; }
        }

    public class PagedUpdatePackagesResponse
        {
            public List<UpdatePackageDto> Packages { get; set; } = new();
            public int TotalCount { get; set; }
            public int Page { get; set; }
            public int PageSize { get; set; }
        }

    public class ScheduleMutationResponse : BasicResponse
        {
            public int? ScheduleId { get; set; }
            public int? TargetCount { get; set; }
            public int? CancelledCount { get; set; }
            public int? RollbackScheduleId { get; set; }
        }

    public class UpdateScheduleListItemDto
        {
            public int UpdateScheduleId { get; set; }
            public string ScheduleName { get; set; } = string.Empty;
            public string TargetType { get; set; } = string.Empty;
            public string? TargetFilter { get; set; }
            public string ScheduleType { get; set; } = string.Empty;
            public string Status { get; set; } = string.Empty;
            public int TotalTargetCount { get; set; }
            public string CreatedBy { get; set; } = string.Empty;
            public DateTime CreatedDateUtc { get; set; }
            public DateTime? DispatchedDateUtc { get; set; }
            public DateTime? CompletedDateUtc { get; set; }
            public string? HaltReason { get; set; }
            public int? HaltedAtMCId { get; set; }
            public bool IsRollback { get; set; }
            public int? OriginalScheduleId { get; set; }
            public string PackageType { get; set; } = string.Empty;
            public string PackageVersion { get; set; } = string.Empty;
            public int CompletedCount { get; set; }
            public int FailedCount { get; set; }
            public int InProgressCount { get; set; }
            public int QueuedCount { get; set; }
        }

    public class PagedUpdateSchedulesResponse
        {
            public List<UpdateScheduleListItemDto> Schedules { get; set; } = new();
            public int TotalCount { get; set; }
            public int Page { get; set; }
            public int PageSize { get; set; }
        }

    public class UpdateScheduleDetailDto
        {
            public int UpdateScheduleId { get; set; }
            public string ScheduleName { get; set; } = string.Empty;
            public string TargetType { get; set; } = string.Empty;
            public string? TargetFilter { get; set; }
            public string ScheduleType { get; set; } = string.Empty;
            public string Status { get; set; } = string.Empty;
            public int TotalTargetCount { get; set; }
            public string CreatedBy { get; set; } = string.Empty;
            public DateTime CreatedDateUtc { get; set; }
            public DateTime? DispatchedDateUtc { get; set; }
            public DateTime? CompletedDateUtc { get; set; }
            public string? CancelledBy { get; set; }
            public DateTime? CancelledDateUtc { get; set; }
            public string? HaltReason { get; set; }
            public int? HaltedAtMCId { get; set; }
            public bool IsRollback { get; set; }
            public int? OriginalScheduleId { get; set; }
            public string? PackageType { get; set; }
            public string? PackageVersion { get; set; }
        }

    public class UpdateDeploymentDetailDto
        {
            public int UpdateDeploymentId { get; set; }
            public int MCId { get; set; }
            public int? AgentCommandId { get; set; }
            public string? AgentCommandType { get; set; }
            public string? AgentCommandStatus { get; set; }
            public int? LineNumber { get; set; }
            public int? MCNumber { get; set; }
            public string Status { get; set; } = string.Empty;
            public int AttemptCount { get; set; }
            public int MaxAttempts { get; set; }
            public string? PreviousVersion { get; set; }
            public int ExecutionOrder { get; set; }
            public string? ReportedAgentVersion { get; set; }
            public string? ReportedServiceVersion { get; set; }
            public string? ReportedUpdaterVersion { get; set; }
            public DateTime? StartedDateUtc { get; set; }
            public DateTime? CompletedDateUtc { get; set; }
            public string? ErrorMessage { get; set; }
        }

    public class UpdateScheduleDetailResponse
        {
            public UpdateScheduleDetailDto Schedule { get; set; } = new();
            public List<UpdateDeploymentDetailDto> Deployments { get; set; } = new();
        }

    public class ArchivedUpdatePackageDto
        {
            public int UpdatePackageId { get; set; }
            public string PackageType { get; set; } = string.Empty;
            public string Version { get; set; } = string.Empty;
            public string FileName { get; set; } = string.Empty;
            public long FileSize { get; set; }
            public string? Description { get; set; }
            public string UploadedBy { get; set; } = string.Empty;
            public DateTime UploadedDate { get; set; }
            public DateTime? ArchivedDate { get; set; }
            public int DaysUntilPurge { get; set; }
        }

    public class ArchivedPackagesResponse
        {
            public List<ArchivedUpdatePackageDto> Packages { get; set; } = new();
            public int RetentionDays { get; set; }
        }
}



