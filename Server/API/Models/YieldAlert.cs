using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    public class YieldAlert
    {
        [Key]
        public int Id { get; set; }

        public int MachineId { get; set; }
        
        [MaxLength(100)]
        public string MachineName { get; set; } = string.Empty;

        public int LineNumber { get; set; }

        public double CurrentYield { get; set; }
        public double Threshold { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public bool IsActive { get; set; } = true;

        public bool IsAcknowledged { get; set; } = false;
        public DateTime? AcknowledgedAt { get; set; }

        public DateTime? ResolvedAt { get; set; }

        public DateTime? DateRangeStart { get; set; }
        public DateTime? DateRangeEnd { get; set; }
    }
}

