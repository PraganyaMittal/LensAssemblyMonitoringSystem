// FactoryMC Model - CLEANED
// Location: Models/FactoryMC.cs

using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    [Table("FactoryMCs")]
    public class FactoryMC
    {
        [Key]
        public int MCId { get; set; }

        [Required]
        public int LineNumber { get; set; }

        [Required]
        public int MCNumber { get; set; }

        [Required]
        [StringLength(50)]
        public string IPAddress { get; set; } = "0.0.0.0";

        [Required]
        [StringLength(500)]
        public string ConfigFilePath { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string LogFolderPath { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string ModelFolderPath { get; set; } = string.Empty;

        // New: model version for this MC (e.g., 3.5, 4.0)
        [Required]
        [StringLength(20)]
        public string ModelVersion { get; set; } = "3.5";

        // Log analyzer support: stores JSON structure of log files/folders
        public string? LogStructureJson { get; set; }

        public bool IsApplicationRunning { get; set; } = false;

        public bool IsOnline { get; set; } = false;

        public DateTime? LastHeartbeat { get; set; }

        public DateTime RegisteredDate { get; set; } = DateTime.Now;

        [StringLength(500)]
        public string InstallDir { get; set; } = @"C:\Factory_Dirs\";

        public DateTime LastUpdated { get; set; } = DateTime.Now;

        // ── Component Version Tracking (reported via agent heartbeat) ──

        [StringLength(50)]
        public string? AgentVersion { get; set; }

        [StringLength(50)]
        public string? ServiceVersion { get; set; }

        [StringLength(50)]
        public string? AutoUpdaterVersion { get; set; }

        [StringLength(50)]
        public string? LAIVersion { get; set; }

        // ── IPC Health (Agent ↔ PipeServer pipe status, reported via heartbeat) ──

        /// <summary>
        /// Whether the agent's Named Pipe connection to the PipeServer is active.
        /// </summary>
        public bool IpcConnected { get; set; } = false;

        /// <summary>
        /// Round-trip latency of the last IPC PING/PONG in milliseconds.
        /// Null if IPC is disconnected or not yet measured.
        /// </summary>
        public int? IpcLastPingMs { get; set; }

        // Navigation properties
        public virtual ICollection<Model> Models { get; set; } = new List<Model>();
        public virtual ICollection<AgentCommand> Commands { get; set; } = new List<AgentCommand>();
    }
}
