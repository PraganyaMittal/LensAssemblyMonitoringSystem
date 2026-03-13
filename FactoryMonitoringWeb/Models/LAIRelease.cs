using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Tracks LAI software releases imported from the QA verification machine.
    /// The web app stores only metadata — agents pull the LAI binary directly
    /// from the shared network path.
    /// </summary>
    public class LAIRelease
    {
        [Key]
        public int LAIReleaseId { get; set; }

        /// <summary>
        /// LAI version string, e.g. "5.0.0".
        /// </summary>
        [Required]
        [StringLength(50)]
        public string Version { get; set; } = string.Empty;

        /// <summary>
        /// UNC shared network path to the release folder.
        /// e.g. "\\VERIFY-PC\LAI-Releases\v5.0.0\"
        /// </summary>
        [Required]
        [StringLength(1000)]
        public string SharedPath { get; set; } = string.Empty;

        /// <summary>
        /// Name of the package file inside the shared folder.
        /// e.g. "LAI-Assembly-v5.0.0.zip"
        /// </summary>
        [Required]
        [StringLength(200)]
        public string PackageName { get; set; } = string.Empty;

        /// <summary>
        /// Release notes parsed from the metadata file.
        /// </summary>
        public string? ReleaseNotes { get; set; }

        /// <summary>
        /// Which factory line this LAI release was deployed to.
        /// </summary>
        [Required]
        public int TargetLineNumber { get; set; }

        [Required]
        [StringLength(100)]
        public string RegisteredBy { get; set; } = string.Empty;

        public DateTime RegisteredDateUtc { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// State machine: Registered → Deploying → Completed / Failed
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Registered";

        public DateTime? CompletedDateUtc { get; set; }

        [StringLength(2000)]
        public string? ErrorMessage { get; set; }
    }
}
