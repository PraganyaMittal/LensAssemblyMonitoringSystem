using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{

    public class LAIRelease
    {
        [Key]
        public int LAIReleaseId { get; set; }

        [Required]
        [StringLength(50)]
        public string Version { get; set; } = string.Empty;

        [Required]
        [StringLength(1000)]
        public string SharedPath { get; set; } = string.Empty;

        [Required]
        [StringLength(200)]
        public string PackageName { get; set; } = string.Empty;

        public string? ReleaseNotes { get; set; }

        [Required]
        public int TargetLineNumber { get; set; }

        [Required]
        [StringLength(100)]
        public string RegisteredBy { get; set; } = string.Empty;

        public DateTime RegisteredDateUtc { get; set; } = DateTime.UtcNow;

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Registered";

        public DateTime? CompletedDateUtc { get; set; }

        [StringLength(2000)]
        public string? ErrorMessage { get; set; }
    }
}

