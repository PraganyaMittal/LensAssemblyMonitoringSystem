using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Represents a deployment schedule — a plan to deploy an UpdatePackage
    /// to one or more target MCs. Created via Feature 2 (Deployment Scheduling).
    /// </summary>
    public class UpdateSchedule
    {
        [Key]
        public int UpdateScheduleId { get; set; }

        /// <summary>
        /// FK → UpdatePackage to deploy
        /// </summary>
        [Required]
        public int UpdatePackageId { get; set; }

        /// <summary>
        /// Display name, e.g. "LAI v4.2.1 → Line 1"
        /// </summary>
        [Required]
        [StringLength(200)]
        public string ScheduleName { get; set; } = string.Empty;

        /// <summary>
        /// Target selection strategy: "All", "ByVersion", "ByLine", "SelectedMCs"
        /// </summary>
        [Required]
        [StringLength(30)]
        public string TargetType { get; set; } = string.Empty;

        /// <summary>
        /// JSON filter for target resolution. Examples:
        /// ByVersion: {"version":"3.5"}
        /// ByLine: {"lineNumbers":[1,2]}
        /// SelectedMCs: {"mcIds":[1,2,3]}
        /// </summary>
        public string? TargetFilter { get; set; }

        /// <summary>
        /// "Immediate" or "Scheduled"
        /// </summary>
        [Required]
        [StringLength(20)]
        public string ScheduleType { get; set; } = "Immediate";

        /// <summary>
        /// When to dispatch (null for Immediate deployments)
        /// </summary>
        public DateTime? ScheduledTimeUtc { get; set; }

        /// <summary>
        /// State machine: Pending → Dispatching → InProgress → Completed / PartiallyCompleted / Cancelled
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Pending";

        /// <summary>
        /// Snapshot of resolved MC count at creation time
        /// </summary>
        public int TotalTargetCount { get; set; }

        [Required]
        [StringLength(100)]
        public string CreatedBy { get; set; } = string.Empty;

        public DateTime CreatedDateUtc { get; set; } = DateTime.UtcNow;

        public DateTime? DispatchedDateUtc { get; set; }

        public DateTime? CompletedDateUtc { get; set; }

        [StringLength(100)]
        public string? CancelledBy { get; set; }

        public DateTime? CancelledDateUtc { get; set; }

        public bool IsActive { get; set; } = true;

        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;

        // Navigation properties
        [ForeignKey("UpdatePackageId")]
        public virtual UpdatePackage? UpdatePackage { get; set; }

        public virtual ICollection<UpdateDeployment> Deployments { get; set; } = new List<UpdateDeployment>();
    }
}
