using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    [Table("LensAssemblyMCs")]
    public class LensAssemblyMC
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

        [Required]
        [StringLength(20)]
        public string ModelVersion { get; set; } = "3.5";

        public string? LogStructureJson { get; set; }

        public bool IsApplicationRunning { get; set; } = false;

        public bool IsOnline { get; set; } = false;

        public DateTime? LastHeartbeat { get; set; }

        public DateTime RegisteredDate { get; set; } = DateTime.Now;

        public DateTime LastUpdated { get; set; } = DateTime.Now;

        [Required]
        [StringLength(30)]
        public string LifecycleState { get; set; } = "Active";

        public DateTime? LifecycleRequestedAtUtc { get; set; }

        public DateTime? LifecycleCompletedAtUtc { get; set; }

        public int? LifecycleCommandId { get; set; }

        [StringLength(1000)]
        public string? LifecycleError { get; set; }

        [StringLength(50)]
        public string? AgentVersion { get; set; }

        [StringLength(50)]
        public string? ServiceVersion { get; set; }

        [StringLength(50)]
        public string? AutoUpdaterVersion { get; set; }

        [StringLength(50)]
        public string? LAIVersion { get; set; }

        // Diagnostics fields (updated every 60s via /api/agent/diagnostics)
        public int? MemoryMB { get; set; }
        public int? UptimeMinutes { get; set; }
        public int? ErrorCount { get; set; }
        public int? ThreadCount { get; set; }
        public DateTime? LastDiagnostics { get; set; }

        public virtual ICollection<Model> Models { get; set; } = new List<Model>();
        public virtual ICollection<AgentCommand> Commands { get; set; } = new List<AgentCommand>();
    }
}

