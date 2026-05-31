using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace LensAssemblyMonitoringWeb.Features.Agents.Contracts
{
    public class AgentRegistrationRequest
        {
            /// <summary>
            /// The physical assembly line number where the MC resides.
            /// </summary>
            /// <example>2</example>
            [Required]
            [Range(1, 1000, ErrorMessage = "Line Number must be between 1 and 1000")]
            public int LineNumber { get; set; }
    
            /// <summary>
            /// Unique machine identifier within the specified assembly line.
            /// </summary>
            /// <example>4</example>
            [Required]
            [Range(1, 10000, ErrorMessage = "MC Number must be between 1 and 10000")]
            public int MCNumber { get; set; }
    
            /// <summary>
            /// The network IP address of the MC station.
            /// </summary>
            /// <example>10.250.205.158</example>
            [Required]
            [RegularExpression(@"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$", ErrorMessage = "Invalid IP Address format")]
            public string IPAddress { get; set; } = string.Empty;
    
            /// <summary>
            /// Path to the local C++ agent configuration settings.json.
            /// </summary>
            /// <example>C:\FactoryStation\Config\settings.json</example>
            [Required]
            [StringLength(260, ErrorMessage = "Config path is too long")]
            public string ConfigFilePath { get; set; } = string.Empty;
    
            /// <summary>
            /// Folder where physical log files are monitored and stored locally.
            /// </summary>
            /// <example>C:\FactoryStation\Logs</example>
            [Required]
            [StringLength(260, ErrorMessage = "Log folder path is too long")]
            public string LogFolderPath { get; set; } = string.Empty;
    
            /// <summary>
            /// Root folder where machine vision models are loaded locally.
            /// </summary>
            /// <example>C:\FactoryStation\Models</example>
            [StringLength(260)]
            public string ModelFolderPath { get; set; } = string.Empty;
    
            /// <summary>
            /// Current hardware model generation sequence identifier.
            /// </summary>
            /// <example>v1.2.0</example>
            [StringLength(50)]
            public string GenerationNo { get; set; } = string.Empty;
    
            /// <summary>
            /// JSON-serialized tree representation of the local monitored log directory structure.
            /// </summary>
            /// <example>[{"name":"Inspection_NG_20260530","isDir":true,"files":[{"name":"cam_left.bmp","isDir":false}]}]</example>
            public string LogStructureJson { get; set; } = string.Empty;
    
            /// <summary>
            /// Name of the model configuration file currently applied on the MC.
            /// </summary>
            /// <example>lens_standard_A</example>
            [StringLength(255)]
            public string? CurrentModelName { get; set; }
    
            /// <summary>
            /// Full local filesystem path of the current active model file.
            /// </summary>
            /// <example>C:\FactoryStation\Models\lens_standard_A.zip</example>
            [StringLength(500)]
            public string? CurrentModelPath { get; set; }
    
            /// <summary>
            /// Text content of the MC local configuration file.
            /// </summary>
            /// <example>{"StationId":"MC-04","Timeout":5000}</example>
            public string? ConfigContent { get; set; }
    
            /// <summary>
            /// List of machine vision models present locally in the MC's storage.
            /// </summary>
            public List<ModelInfo>? Models { get; set; }
        }

    public class AgentRegistrationResponse
        {
            /// <summary>
            /// Indicates if the registration succeeded.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Assigned or existing internal ID of the Machine Controller in the FMS database.
            /// </summary>
            /// <example>42</example>
            public int MCId { get; set; }
    
            /// <summary>
            /// Confirmed Line Number of the registered station.
            /// </summary>
            /// <example>2</example>
            public int LineNumber { get; set; }
    
            /// <summary>
            /// Confirmed MC Number of the registered station.
            /// </summary>
            /// <example>4</example>
            public int MCNumber { get; set; }
    
            /// <summary>
            /// Narrative status message or error details.
            /// </summary>
            /// <example>Agent registered successfully.</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// True if this was a fresh database entry, or false if it was an update/re-registration.
            /// </summary>
            /// <example>true</example>
            public bool IsNewRegistration { get; set; }
        }

    public class HeartbeatRequest
        {
            /// <summary>
            /// Assigned ID of the Machine Controller station.
            /// </summary>
            /// <example>42</example>
            [Required]
            public int MCId { get; set; }
    
            [JsonProperty("PCId")]
            private int PCId { set { MCId = value; } }
    
            /// <summary>
            /// True if the main alignment and assembly inspection loop is running.
            /// </summary>
            /// <example>true</example>
            public bool IsApplicationRunning { get; set; }
    
            /// <summary>
            /// Version string of the active C++ Agent daemon.
            /// </summary>
            /// <example>1.2.0.45</example>
            [StringLength(50)]
            public string? AgentVersion { get; set; }
    
            /// <summary>
            /// Version string of the underlying FMS background service layer.
            /// </summary>
            /// <example>1.2.0.45</example>
            [StringLength(50)]
            public string? ServiceVersion { get; set; }
    
            /// <summary>
            /// Version string of the local agent automatic updates driver.
            /// </summary>
            /// <example>1.0.3</example>
            [StringLength(50)]
            public string? AutoUpdaterVersion { get; set; }
    
            /// <summary>
            /// Version of the Lens Assembly Installer engine.
            /// </summary>
            /// <example>2.1.0.8</example>
            [StringLength(50)]
            public string? LAIVersion { get; set; }
        }

    public class UpdateModelRequest
        {
            /// <summary>
            /// Target Machine Controller identifier.
            /// </summary>
            /// <example>42</example>
            [Required]
            public int MCId { get; set; }
    
            /// <summary>
            /// Active model recipe configuration name.
            /// </summary>
            /// <example>lens_standard_A</example>
            [StringLength(255)]
            public string? ModelName { get; set; }
        }

    public class HeartbeatResponse
        {
            /// <summary>
            /// Indicates if heartbeat transaction recorded successfully.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Flags if one or more pending remote instructions are ready for delivery to this agent.
            /// </summary>
            /// <example>true</example>
            public bool HasPendingCommands { get; set; }
    
            /// <summary>
            /// Ordered sequence of commands assigned to the agent.
            /// </summary>
            public List<CommandInfo> Commands { get; set; } = new List<CommandInfo>();
        }

    public class CommandInfo
        {
            /// <summary>
            /// Server database auto-assigned command transaction ID.
            /// </summary>
            /// <example>108</example>
            public int CommandId { get; set; }
    
            /// <summary>
            /// Identified action keyword parsed by agent router.
            /// </summary>
            /// <example>UPLOAD_LOG</example>
            public string CommandType { get; set; } = string.Empty;
    
            /// <summary>
            /// Action-specific configuration parameters or path contexts.
            /// </summary>
            /// <example>C:\FactoryStation\Logs\Inspection_NG_20260530\inspection_run.log</example>
            public string? CommandData { get; set; }
        }

    public class ConfigUpdateRequest
        {
            /// <summary>
            /// Target MC identifier.
            /// </summary>
            /// <example>42</example>
            [Required]
            public int MCId { get; set; }
    
            /// <summary>
            /// Entire new configurations payload block.
            /// </summary>
            /// <example>{"StationId":"MC-04","Timeout":5000}</example>
            [Required]
            public string ConfigContent { get; set; } = string.Empty;
        }

    public class CommandResultRequest
        {
            /// <summary>
            /// Database key of the delivered command.
            /// </summary>
            /// <example>108</example>
            [Required]
            public int CommandId { get; set; }
    
            /// <summary>
            /// Narrative status tag reporting completion state.
            /// </summary>
            /// <example>Success</example>
            public string Status { get; set; } = string.Empty;
    
            /// <summary>
            /// Output parameters, metrics, or base64 streams generated by the execution.
            /// </summary>
            /// <example>{"uploadedBytes": 450230}</example>
            public string? ResultData { get; set; }
    
            /// <summary>
            /// Formatted error strings if the action failed.
            /// </summary>
            /// <example>File not found or locked by another process.</example>
            public string? ErrorMessage { get; set; }
        }

    public class CommandResultData
        {
            /// <summary>
            /// True if agent record was successfully purged from registry.
            /// </summary>
            /// <example>false</example>
            public bool AgentDeleted { get; set; }
        }

    public class CommandResultApiResponse
        {
            /// <summary>
            /// Transaction status marker.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Detailed operation feedback message.
            /// </summary>
            /// <example>Command callback processed.</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// Embedded command result metrics.
            /// </summary>
            public CommandResultData? Data { get; set; }
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
}




