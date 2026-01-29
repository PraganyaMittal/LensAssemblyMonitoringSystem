using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    public class ModelDistribution
    {
        [Key]
        public int DistributionId { get; set; }

        [Required]
        public int ModelFileId { get; set; }

        public int? MCId { get; set; }

        public int? LineNumber { get; set; }

        [Required]
        [StringLength(20)]
        public string DistributionType { get; set; } = "Single"; // 'Single', 'Line', 'All'

        [StringLength(20)]
        public string Status { get; set; } = "Pending"; // 'Pending', 'InProgress', 'Completed', 'Failed'

        public DateTime RequestedDate { get; set; } = DateTime.Now;

        public DateTime? CompletedDate { get; set; }

        public string? ErrorMessage { get; set; }

        public bool ApplyOnDownload { get; set; } = false;

        // Navigation properties
        [ForeignKey("ModelFileId")]
        public virtual ModelFile? ModelFile { get; set; }

        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }
    }
}
