// FactoryPC Model - CLEANED
// Location: Models/FactoryPC.cs

using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    [Table("FactoryPCs")]
    public class FactoryPC
    {
        [Key]
        public int PCId { get; set; }

        [Required]
        public int LineNumber { get; set; }

        [Required]
        public int PCNumber { get; set; }

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

        // New: model version for this PC (e.g., 3.5, 4.0)
        [Required]
        [StringLength(20)]
        public string ModelVersion { get; set; } = "3.5";

        // Log analyzer support: stores JSON structure of log files/folders
        public string? LogStructureJson { get; set; }

        public bool IsApplicationRunning { get; set; } = false;

        public bool IsOnline { get; set; } = false;

        public DateTime? LastHeartbeat { get; set; }

        public DateTime RegisteredDate { get; set; } = DateTime.Now;

        public DateTime LastUpdated { get; set; } = DateTime.Now;

        // Navigation properties
        public virtual ConfigFile? ConfigFile { get; set; }
        public virtual ICollection<Model> Models { get; set; } = new List<Model>();
        public virtual ICollection<AgentCommand> Commands { get; set; } = new List<AgentCommand>();
    }
}
