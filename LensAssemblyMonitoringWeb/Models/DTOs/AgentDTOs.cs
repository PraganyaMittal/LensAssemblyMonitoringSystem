using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Models.DTOs
{
    
    public class AgentRegistrationRequest
    {
        [Required]
        [Range(1, 1000, ErrorMessage = "Line Number must be between 1 and 1000")]
        public int LineNumber { get; set; }

        [Required]
        [Range(1, 10000, ErrorMessage = "MC Number must be between 1 and 10000")]
        public int MCNumber { get; set; }

        [Required]
        [RegularExpression(@"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$", ErrorMessage = "Invalid IP Address format")]
        public string IPAddress { get; set; } = string.Empty;

        [Required]
        [StringLength(260, ErrorMessage = "Config path is too long")]
        public string ConfigFilePath { get; set; } = string.Empty;

        [Required]
        [StringLength(260, ErrorMessage = "Log folder path is too long")]
        public string LogFolderPath { get; set; } = string.Empty;

        [StringLength(260)]
        public string ModelFolderPath { get; set; } = string.Empty;

        [StringLength(50)]
        public string ModelVersion { get; set; } = string.Empty;
        public string LogStructureJson { get; set; } = string.Empty;

        [StringLength(255)]
        public string? CurrentModelName { get; set; }

        [StringLength(500)]
        public string? CurrentModelPath { get; set; }

        public string? ConfigContent { get; set; }

        public List<ModelInfo>? Models { get; set; }
    }

    public class AgentRegistrationResponse
    {
        public bool Success { get; set; }
        public int MCId { get; set; }
        public int LineNumber { get; set; }
        public int MCNumber { get; set; }

        public string Message { get; set; } = string.Empty;
        public bool IsNewRegistration { get; set; }
    }

    public class HeartbeatRequest
    {
        [Required]
        public int MCId { get; set; }

        [JsonProperty("PCId")]
        private int PCId { set { MCId = value; } }

        public bool IsApplicationRunning { get; set; }

        [StringLength(255)]
        public string? CurrentModelName { get; set; }

        [StringLength(500)]
        public string? CurrentModelPath { get; set; }

        [StringLength(50)]
        public string? AgentVersion { get; set; }

        [StringLength(50)]
        public string? ServiceVersion { get; set; }

        [StringLength(50)]
        public string? AutoUpdaterVersion { get; set; }

        [StringLength(50)]
        public string? LAIVersion { get; set; }

        public bool? IpcConnected { get; set; }

        public int? IpcLastPingMs { get; set; }
    }

    public class DiagnosticsRequest
    {
        [Required]
        public int MCId { get; set; }

        public int? MemoryMB { get; set; }

        public int? UptimeMinutes { get; set; }

        public int? ErrorCount { get; set; }

        public int? ThreadCount { get; set; }
    }

    public class HeartbeatResponse
    {
        public bool Success { get; set; }
        public bool HasPendingCommands { get; set; }
        public List<CommandInfo> Commands { get; set; } = new List<CommandInfo>();
    }

    public class CommandInfo
    {
        public int CommandId { get; set; }
        public string CommandType { get; set; } = string.Empty;
        public string? CommandData { get; set; }
    }

    public class ConfigUpdateRequest
    {
        [Required]
        public int MCId { get; set; }

        [Required]
        public string ConfigContent { get; set; } = string.Empty;
    }

    public class ModelSyncRequest
    {
        [Required]
        public int MCId { get; set; }

        public List<ModelInfo> Models { get; set; } = new List<ModelInfo>();
    }

    public class ModelInfo
    {
        public string ModelName { get; set; } = string.Empty;
        public string ModelPath { get; set; } = string.Empty;
        public bool IsCurrent { get; set; }
    }

    public class LogStructureSyncRequest
    {
        [Required]
        public int MCId { get; set; }

        public string LogStructureJson { get; set; } = string.Empty;
    }

    public class CommandResultRequest
    {
        [Required]
        public int CommandId { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? ResultData { get; set; }
        public string? ErrorMessage { get; set; }
    }

    public class ApiResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public object? Data { get; set; }
    }

    public class MCUpdateRequest
    {
        [Required]
        public int MCId { get; set; }

        [Required]
        [Range(1, 1000, ErrorMessage = "Line Number must be between 1 and 1000")]
        public int LineNumber { get; set; }

        [Required]
        [Range(1, 10000, ErrorMessage = "MC Number must be between 1 and 10000")]
        public int MCNumber { get; set; }

        [Required]
        [RegularExpression(@"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$", ErrorMessage = "Invalid IP Address format")]
        public string IPAddress { get; set; } = string.Empty;

        [Required]
        [StringLength(260, ErrorMessage = "Config path is too long")]
        public string ConfigFilePath { get; set; } = string.Empty;

        [Required]
        [StringLength(260, ErrorMessage = "Log folder path is too long")]
        public string LogFolderPath { get; set; } = string.Empty;

        [Required]
        [StringLength(260, ErrorMessage = "Model folder path is too long")]
        public string ModelFolderPath { get; set; } = string.Empty;

        [Required]
        [StringLength(50, ErrorMessage = "Version string is too long")]
        public string ModelVersion { get; set; } = string.Empty;
    }

}

