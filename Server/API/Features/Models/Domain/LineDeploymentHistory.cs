using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Features.Models.Domain
{
    /// <summary>
    /// Tracks model deployments per line (audit trail).
    /// </summary>
    [Table("LineDeploymentHistories")]
    public class LineDeploymentHistory
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int LineNumber { get; set; }

        [Required]
        [MaxLength(20)]
        public string Version { get; set; } = "3.5";

        [Required]
        [MaxLength(255)]
        public string ModelName { get; set; } = default!;

        public DateTime DeployedDate { get; set; } = DateTime.Now;

        [MaxLength(100)]
        public string? DeployedBy { get; set; }

        [MaxLength(20)]
        public string Status { get; set; } = "Pending";  // Pending | InProgress | Success | Failed | RolledBack

        public int MachineCount { get; set; }

        /// <summary>JSON: per-machine results</summary>
        public string? Details { get; set; }
    }
}


