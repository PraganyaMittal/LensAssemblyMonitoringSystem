using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Represents a per-MC deployment record within a schedule.
    /// One UpdateDeployment per target MC. Tracks status, attempt count,
    /// and the previous version for rollback (Feature 4).
    /// </summary>
    public class UpdateDeployment
    {
        [Key]
        public int UpdateDeploymentId { get; set; }

        /// <summary>
        /// FK → parent UpdateSchedule
        /// </summary>
        [Required]
        public int UpdateScheduleId { get; set; }

        /// <summary>
        /// FK → target FactoryMC
        /// </summary>
        [Required]
        public int MCId { get; set; }

        /// <summary>
        /// FK → AgentCommand created on dispatch (null until dispatched)
        /// </summary>
        public int? AgentCommandId { get; set; }

        /// <summary>
        /// State machine: Queued → Dispatched → Downloading → Installing → Completed / Failed / Cancelled / Skipped
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Queued";

        public int AttemptCount { get; set; } = 0;

        public int MaxAttempts { get; set; } = 3;

        /// <summary>
        /// MC's ModelVersion before this update — stored at schedule creation for rollback (Feature 4)
        /// </summary>
        [StringLength(50)]
        public string? PreviousVersion { get; set; }

        public DateTime? StartedDateUtc { get; set; }

        public DateTime? CompletedDateUtc { get; set; }

        [StringLength(2000)]
        public string? ErrorMessage { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;

        // Navigation properties
        [ForeignKey("UpdateScheduleId")]
        public virtual UpdateSchedule? UpdateSchedule { get; set; }

        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }

        [ForeignKey("AgentCommandId")]
        public virtual AgentCommand? AgentCommand { get; set; }
    }
}
