using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    public class Model
    {
        [Key]
        public int ModelId { get; set; }

        [Required]
        public int MCId { get; set; }

        [Required]
        [StringLength(255)]
        public string ModelName { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string ModelPath { get; set; } = string.Empty;

        public bool IsCurrentModel { get; set; } = false;

        public DateTime DiscoveredDate { get; set; } = DateTime.Now;

        public DateTime? LastUsed { get; set; }

        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }
    }
}

