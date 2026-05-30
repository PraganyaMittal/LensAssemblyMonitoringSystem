using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Features.Logs.Domain
{
    public class SystemLog
    {
        [Key]
        public int LogId { get; set; }

        public int? MCId { get; set; }

        [Required]
        [StringLength(255)]
        public string Action { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string ActionType { get; set; } = "Info"; 

        public string? Details { get; set; }

        [StringLength(50)]
        public string? IPAddress { get; set; }

        [StringLength(100)]
        public string? UserName { get; set; }

        public DateTime Timestamp { get; set; } = DateTime.Now;

        [ForeignKey("MCId")]
        public virtual LensAssemblyMC? LensAssemblyMC { get; set; }
    }
}




