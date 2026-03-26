using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{

    public class UpdateSchedule
    {
        [Key]
        public int UpdateScheduleId { get; set; }

        [Required]
        public int UpdatePackageId { get; set; }

        [Required]
        [StringLength(200)]
        public string ScheduleName { get; set; } = string.Empty;

        [Required]
        [StringLength(30)]
        public string TargetType { get; set; } = string.Empty;

        public string? TargetFilter { get; set; }

        [Required]
        [StringLength(20)]
        public string ScheduleType { get; set; } = "Immediate";

        public DateTime? ScheduledTimeUtc { get; set; }

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Pending";

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

        public int? OriginalScheduleId { get; set; }

        public bool IsRollback { get; set; } = false;

        [StringLength(2000)]
        public string? HaltReason { get; set; }

        public int? HaltedAtMCId { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;

        [ForeignKey("UpdatePackageId")]
        public virtual UpdatePackage? UpdatePackage { get; set; }

        [ForeignKey("OriginalScheduleId")]
        public virtual UpdateSchedule? OriginalSchedule { get; set; }

        [ForeignKey("HaltedAtMCId")]
        public virtual LensAssemblyMC? HaltedAtMC { get; set; }

        public virtual ICollection<UpdateDeployment> Deployments { get; set; } = new List<UpdateDeployment>();
    }
}

