namespace LensAssemblyMonitoringWeb.Models.DTOs
{
    /// <summary>
    /// Lightweight success/message envelope used as a base class for richer response types.
    /// For error paths, use <see cref="ApiErrorResponse"/> instead.
    /// </summary>
    public class BasicResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    /// <summary>
    /// Canonical error response shape returned on all non-2xx paths.
    /// Every controller error path must use this type so callers can rely on a
    /// consistent <c>{ success, message, errorCode }</c> contract.
    /// </summary>
    /// <example>
    /// {
    ///   "success": false,
    ///   "message": "Model not found in library",
    ///   "errorCode": "model_not_found"
    /// }
    /// </example>
    public class ApiErrorResponse
    {
        /// <summary>Always <c>false</c> for error responses.</summary>
        /// <example>false</example>
        public bool Success { get; set; } = false;

        /// <summary>Human-readable description of the failure.</summary>
        /// <example>Model not found in library</example>
        public string Message { get; set; } = string.Empty;

        /// <summary>
        /// Machine-parseable snake_case error key.
        /// Callers should switch on this value rather than parsing <see cref="Message"/>.
        /// </summary>
        /// <example>model_not_found</example>
        public string? ErrorCode { get; set; }
    }

    public class AgentSettingsDto
    {
        public int LineNumber { get; set; }
        public int MCNumber { get; set; }
        public string ConfigFilePath { get; set; } = string.Empty;
        public string LogFolderPath { get; set; } = string.Empty;
        public string ModelFolderPath { get; set; } = string.Empty;
        public string GenerationNo { get; set; } = string.Empty;
    }

    public class AgentSettingsResponse
    {
        public bool Success { get; set; }
        public AgentSettingsDto Data { get; set; } = new();
    }

    public class McCommandResponse : BasicResponse
    {
        public int? CommandId { get; set; }
        public string? LifecycleState { get; set; }
        public bool? IsOffline { get; set; }
    }

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

    public class YieldReportResponse
    {
        public bool Success { get; set; }
        public double Current24hYield { get; set; }
    }

    public class YieldDailySummaryDto
    {
        public DateTime Date { get; set; }
        public int TrayCount { get; set; }
        public int TotalGood { get; set; }
        public int TotalCount { get; set; }
        public double AvgYield { get; set; }
    }

    public class YieldTraySummaryDto
    {
        public string TrayId { get; set; } = string.Empty;
        public int GoodCount { get; set; }
        public int TotalCount { get; set; }
        public double YieldPercentage { get; set; }
    }

    public class SaveFilesResponse : BasicResponse
    {
        public int Count { get; set; }
    }

    public class FileContentResponse
    {
        public string Content { get; set; } = string.Empty;
    }

    public class ZipEntryDto
    {
        public string Path { get; set; } = string.Empty;
        public long Size { get; set; }
        public bool IsDirectory { get; set; }
    }

    public class ModelLibraryItemDto
    {
        public int ModelFileId { get; set; }
        public string ModelName { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string? Description { get; set; }
        public string? Category { get; set; }
        public DateTime UploadedDate { get; set; }
        public string? UploadedBy { get; set; }
    }

    public class ModelUploadResponse : BasicResponse
    {
        public int ModelFileId { get; set; }
        public string ModelName { get; set; } = string.Empty;
        public string Checksum { get; set; } = string.Empty;
    }

    public class ModelApplyResponse : BasicResponse
    {
        public bool Checks { get; set; }
        public int TotalTargets { get; set; }
        public int ExistingCount { get; set; }
        public List<int> ExistingOnPCIds { get; set; } = new();
        public int AffectedPCs { get; set; }
    }

    public class ModelLibraryConflictResponse
    {
        public string ConflictType { get; set; } = string.Empty;
        public string Error { get; set; } = string.Empty;
        public int? ExistingModelFileId { get; set; }
        public string? ExistingModelName { get; set; }
    }

    public class ModelLibraryLineAvailableModelDto
    {
        public string ModelName { get; set; } = string.Empty;
        public int? ModelFileId { get; set; }
        public bool InLibrary { get; set; }
        public List<int> AvailableOnMCIds { get; set; } = new();
        public int TotalPCsInLine { get; set; }
        public int ComplianceCount { get; set; }
        public string ComplianceText { get; set; } = string.Empty;
    }

    public class LineModelDeleteResponse : BasicResponse
    {
        public int CancelledCommands { get; set; }
        public int RemovedEntries { get; set; }
    }

    public class DownloadRequestResponse
    {
        public string RequestId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
    }

    public class DownloadStatusResponse
    {
        public string Status { get; set; } = string.Empty;
        public string? Error { get; set; }
    }

    public class ModelGenerationDto
    {
        public int GenerationNoId { get; set; }
        public int VersionNumber { get; set; }
        public DateTime CreatedDate { get; set; }
        public string? CreatedBy { get; set; }
        public string? ChangeSummary { get; set; }
        public long Size { get; set; }
    }

    public class ModelHistoryDto
    {
        public int LogId { get; set; }
        public DateTime Timestamp { get; set; }
        public string? Details { get; set; }
    }

    public class RevertGenerationResponse
    {
        public bool Success { get; set; }
        public int NewVersion { get; set; }
    }

    public class ModelManagementLineDto
    {
        public int LineNumber { get; set; }
        public int MachineCount { get; set; }
        public int OnlineCount { get; set; }
        public int ModelCount { get; set; }
        public bool HasDefaultModel { get; set; }
    }

    public class ModelManagementLineModelDto
    {
        public string ModelName { get; set; } = string.Empty;
        public int LensCount { get; set; }
        public int SpacerCount { get; set; }
        public string? AssemblySequence { get; set; }
        public decimal? TTL { get; set; }
        public int? TrayDimX { get; set; }
        public int? TrayDimY { get; set; }
        public int MachineCount { get; set; }
        public string? StepParamsJson { get; set; }
        public string? ComponentParamsJson { get; set; }
        public string? BarrelSlotsJson { get; set; }
        public string Version { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
        public DateTime ModifiedDate { get; set; }
        public int ConfiguredMachines { get; set; }
        public int TotalMachines { get; set; }
        public DateTime? LastSyncDate { get; set; }
        public string? LastSyncStatus { get; set; }
        public DateTime? LastDeployDate { get; set; }
        public string? LastDeployStatus { get; set; }
    }

    public class ModelManagementDefaultModelDto
    {
        public int ModelFileId { get; set; }
        public string ModelName { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public DateTime UploadedDate { get; set; }
        public string? Description { get; set; }
    }

    public class ThumbnailUploadResponse
    {
        public string Message { get; set; } = string.Empty;
        public int Count { get; set; }
        public string? LogFileName { get; set; }
    }

    public class ThumbnailDto
    {
        public string? OperationName { get; set; }
        public string? NgPath { get; set; }
        public string Filename { get; set; } = string.Empty;
        public string Data { get; set; } = string.Empty;
    }

    public class ThumbnailResponse
    {
        public string LogFileName { get; set; } = string.Empty;
        public string? OperationName { get; set; }
        public string? BarrelId { get; set; }
        public List<ThumbnailDto> Thumbnails { get; set; } = new();
        public int Count { get; set; }
    }

    public class ThumbnailAvailabilityResponse
    {
        public string LogFileName { get; set; } = string.Empty;
        public bool Available { get; set; }
    }

    public class InspectionImageDto
    {
        public string Url { get; set; } = string.Empty;
        public string Filename { get; set; } = string.Empty;
    }

    public class InspectionImagesResponse
    {
        public List<InspectionImageDto> Images { get; set; } = new();
        public int Count { get; set; }
        public string? OperationName { get; set; }
    }

    public class LogFileContentResponse
    {
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public long Size { get; set; }
        public string Encoding { get; set; } = "UTF-8";
    }

    public class LogStructureResponse
    {
        [Newtonsoft.Json.JsonProperty("MCId")]
        public int MCId { get; set; }

        [Newtonsoft.Json.JsonProperty("rootPath")]
        public string RootPath { get; set; } = string.Empty;

        [Newtonsoft.Json.JsonProperty("files")]
        public object? Files { get; set; }
    }

    public class PcCurrentModelDto
    {
        public int? ModelId { get; set; }
        public string ModelName { get; set; } = string.Empty;
        public string ModelPath { get; set; } = string.Empty;
        public DateTime? LastUsed { get; set; }
    }

    public class PcAvailableModelDto
    {
        public int ModelId { get; set; }
        public string ModelName { get; set; } = string.Empty;
        public string ModelPath { get; set; } = string.Empty;
        public bool IsCurrentModel { get; set; }
        public DateTime DiscoveredDate { get; set; }
        public DateTime? LastUsed { get; set; }
    }

    public class PcSummaryDto
    {
        public int MCId { get; set; }
        public int LineNumber { get; set; }
        public int MCNumber { get; set; }
        public string IPAddress { get; set; } = string.Empty;
        public string GenerationNo { get; set; } = string.Empty;
        public bool IsOnline { get; set; }
        public bool IsApplicationRunning { get; set; }
        public string LifecycleState { get; set; } = string.Empty;
        public string? AgentVersion { get; set; }
        public string? ServiceVersion { get; set; }
        public DateTime? LastHeartbeat { get; set; }
        public DateTime LastUpdated { get; set; }
        public PcCurrentModelDto? CurrentModel { get; set; }
        public int ModelCount { get; set; }
    }

    public class PcLineGroupDto
    {
        public int LineNumber { get; set; }
        public string? TargetModelName { get; set; }
        public List<PcSummaryDto> Pcs { get; set; } = new();
    }

    public class PcListResponseDto
    {
        public int Total { get; set; }
        public int Online { get; set; }
        public int Offline { get; set; }
        public List<PcLineGroupDto> Lines { get; set; } = new();
    }

    public class PcConfigDto
    {
        public string ConfigContent { get; set; } = string.Empty;
        public DateTime? LastModified { get; set; }
    }

    public class PcDetailsResponseDto : PcSummaryDto
    {
        public string ConfigFilePath { get; set; } = string.Empty;
        public string LogFolderPath { get; set; } = string.Empty;
        public string ModelFolderPath { get; set; } = string.Empty;
        public string? LifecycleError { get; set; }
        public DateTime RegisteredDate { get; set; }
        public List<PcAvailableModelDto> AvailableModels { get; set; } = new();
        public PcConfigDto? Config { get; set; }
    }

    public class VersionCountDto
    {
        public string Version { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class LineCountDto
    {
        public int Line { get; set; }
        public int Count { get; set; }
    }

    public class NetworkStatsResponseDto
    {
        public int TotalPCs { get; set; }
        public int OnlinePCs { get; set; }
        public int OfflinePCs { get; set; }
        public int RunningApps { get; set; }
        public List<VersionCountDto> Versions { get; set; } = new();
        public List<LineCountDto> Lines { get; set; } = new();
    }

}
