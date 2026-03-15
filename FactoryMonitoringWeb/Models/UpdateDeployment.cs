using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{

    public class UpdateDeployment
    {
        [Key]
        public int UpdateDeploymentId { get; set; }

        [Required]
        public int UpdateScheduleId { get; set; }

        [Required]
        public int MCId { get; set; }

        public int? AgentCommandId { get; set; }

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "Queued";

        public int AttemptCount { get; set; } = 0;

        public int MaxAttempts { get; set; } = 3;

        [StringLength(50)]
        public string? PreviousVersion { get; set; }

        public DateTime? StartedDateUtc { get; set; }

        public DateTime? CompletedDateUtc { get; set; }

        [StringLength(2000)]
        public string? ErrorMessage { get; set; }

        

        public int ExecutionOrder { get; set; } = 0;

        [StringLength(50)]
        public string? ReportedAgentVersion { get; set; }

        [StringLength(50)]
        public string? ReportedServiceVersion { get; set; }

        [StringLength(50)]
        public string? ReportedUpdaterVersion { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;

        
        [ForeignKey("UpdateScheduleId")]
        public virtual UpdateSchedule? UpdateSchedule { get; set; }

        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }

        [ForeignKey("AgentCommandId")]
        public virtual AgentCommand? AgentCommand { get; set; }
    }
}

