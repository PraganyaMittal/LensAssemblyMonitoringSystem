using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace FactoryMonitoringWeb.Models.DTOs
{
    // Registration Request
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

        // Optional: agent can send current model info at registration time
        [StringLength(255)]
        public string? CurrentModelName { get; set; }

        [StringLength(500)]
        public string? CurrentModelPath { get; set; }

        // Optional: agent can send its config content at registration time
        public string? ConfigContent { get; set; }

        // Optional: agent can send full model folder list at registration time
        public List<ModelInfo>? Models { get; set; }

        // Optional: agent can specify the install directory for updates/backups
        [StringLength(500)]
        public string? InstallDir { get; set; }
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

    // Heartbeat Request/Response
    public class HeartbeatRequest
    {
        [Required]
        public int MCId { get; set; }

        [JsonProperty("PCId")]
        private int PCId { set { MCId = value; } }

        public bool IsApplicationRunning { get; set; }

        // Optional: agent can report current model name on each heartbeat
        [StringLength(255)]
        public string? CurrentModelName { get; set; }

        [StringLength(500)]
        public string? CurrentModelPath { get; set; }
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

    // Config Update Request
    public class ConfigUpdateRequest
    {
        [Required]
        public int MCId { get; set; }


        [Required]
        public string ConfigContent { get; set; } = string.Empty;
    }

    // Model Sync Request
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

    // Log Structure Sync Request
    public class LogStructureSyncRequest
    {
        [Required]
        public int MCId { get; set; }


        public string LogStructureJson { get; set; } = string.Empty;
    }

    // Command Result Request
    public class CommandResultRequest
    {
        [Required]
        public int CommandId { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? ResultData { get; set; }
        public string? ErrorMessage { get; set; }
    }

    // Generic API Response
    public class ApiResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public object? Data { get; set; }
    }

    // MC Update Request (Used by Frontend)
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
