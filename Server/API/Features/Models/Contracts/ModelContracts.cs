using System.ComponentModel.DataAnnotations;
using LensAssemblyMonitoringWeb.Shared.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Models.Contracts
{
    public class ModelSyncRequest
        {
            /// <summary>
            /// Target MC identifier.
            /// </summary>
            /// <example>42</example>
            [Required]
            public int MCId { get; set; }
    
            /// <summary>
            /// Collection of local models currently found in agent's folder structure.
            /// </summary>
            public List<ModelInfo> Models { get; set; } = new List<ModelInfo>();
        }

    public class ModelInfo
        {
            /// <summary>
            /// Descriptive name of the model recipe.
            /// </summary>
            /// <example>lens_standard_A</example>
            public string ModelName { get; set; } = string.Empty;
    
            /// <summary>
            /// Absolute path on the MC filesystem pointing to the model zip.
            /// </summary>
            /// <example>C:\FactoryStation\Models\lens_standard_A.zip</example>
            public string ModelPath { get; set; } = string.Empty;
    
            /// <summary>
            /// True if this model is current active recipe loaded by the machine alignment loop.
            /// </summary>
            /// <example>true</example>
            public bool IsCurrent { get; set; }
        }

    public class ModelSyncSummaryDto
        {
            /// <summary>
            /// Number of newly registered models.
            /// </summary>
            /// <example>1</example>
            public int Inserted { get; set; }
    
            /// <summary>
            /// Count of refreshed model definitions.
            /// </summary>
            /// <example>0</example>
            public int Updated { get; set; }
    
            /// <summary>
            /// Number of models removed from index.
            /// </summary>
            /// <example>0</example>
            public int Removed { get; set; }
    
            /// <summary>
            /// Active applied model key name.
            /// </summary>
            /// <example>lens_standard_A</example>
            public string? CurrentModel { get; set; }
        }

    public class ModelSyncApiResponse
        {
            /// <summary>
            /// Indicates if the model library sync succeeded.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Context information.
            /// </summary>
            /// <example>Model catalog synchronized.</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// Summary of additions/deletions.
            /// </summary>
            public ModelSyncSummaryDto? Data { get; set; }
        }

    public class ModelFileUploadData
        {
            /// <summary>
            /// Relative/absolute location where file was archived.
            /// </summary>
            /// <example>models/templates/12_v1.zip</example>
            public string StoragePath { get; set; } = string.Empty;
    
            /// <summary>
            /// Computed file validation digest.
            /// </summary>
            /// <example>a1b2c3d4e5f6g7h8i9j0</example>
            public string Checksum { get; set; } = string.Empty;
    
            /// <summary>
            /// Original name of uploaded package.
            /// </summary>
            /// <example>lens_standard_A.zip</example>
            public string OriginalName { get; set; } = string.Empty;
    
            /// <summary>
            /// Target database index for model file record.
            /// </summary>
            /// <example>12</example>
            public int ModelFileId { get; set; }
        }

    public class ModelFileUploadApiResponse
        {
            /// <summary>
            /// Validation result.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Operations text.
            /// </summary>
            /// <example>Model file uploaded and indexed.</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// Storage receipt information.
            /// </summary>
            public ModelFileUploadData? Data { get; set; }
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
}




