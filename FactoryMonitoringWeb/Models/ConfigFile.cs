using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    public class ConfigFile
    {
        [Key]
        public int ConfigId { get; set; }

        [Required]
        public int MCId { get; set; }

        [Required]
        public string ConfigContent { get; set; } = string.Empty;

        public DateTime LastModified { get; set; } = DateTime.Now;

        public bool PendingUpdate { get; set; } = false;

        public string? UpdatedContent { get; set; }

        public DateTime? UpdateRequestTime { get; set; }

        public bool UpdateApplied { get; set; } = false;

        // Navigation property
        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }
    }
}
