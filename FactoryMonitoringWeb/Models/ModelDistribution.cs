using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Tracks the deployment of a model version to specific machines or lines.
    /// Status lifecycle: Queued → Downloading → Verifying → Installing → Completed / Failed
    /// </summary>
    public class ModelDistribution
    {
        [Key]
        public int DistributionId { get; set; }

        [Required]
        public int ModelFileId { get; set; }

        /// <summary>
        /// Which version of the model is being deployed.
        /// </summary>
        public int VersionNumber { get; set; } = 1;

        public int? MCId { get; set; }

        public int? LineNumber { get; set; }

        [Required]
        [StringLength(20)]
        public string DistributionType { get; set; } = "Single"; // 'Single', 'Line', 'All'

        [StringLength(20)]
        public string Status { get; set; } = "Queued"; // 'Queued','Downloading','Verifying','Installing','Completed','Failed'

        /// <summary>
        /// User who initiated this deployment.
        /// </summary>
        [StringLength(100)]
        public string? RequestedBy { get; set; }

        public DateTime RequestedDate { get; set; } = DateTime.Now;

        /// <summary>
        /// When the agent started processing this deployment.
        /// </summary>
        public DateTime? StartedDate { get; set; }

        public DateTime? CompletedDate { get; set; }

        public string? ErrorMessage { get; set; }

        /// <summary>
        /// Number of times this deployment has been retried.
        /// </summary>
        public int RetryCount { get; set; } = 0;

        public bool ApplyOnDownload { get; set; } = false;

        /// <summary>
        /// SHA-256 checksum agent should verify after downloading the model.
        /// </summary>
        [StringLength(64)]
        public string? ExpectedChecksum { get; set; }

        /// <summary>
        /// SHA-256 checksum the agent computed after download — for verification.
        /// </summary>
        [StringLength(64)]
        public string? AgentChecksum { get; set; }

        // Navigation properties
        [ForeignKey("ModelFileId")]
        public virtual ModelFile? ModelFile { get; set; }

        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }
    }
}
