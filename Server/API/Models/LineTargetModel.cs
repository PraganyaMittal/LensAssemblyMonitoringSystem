using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    [Table("LineTargetModels")]
    public class LineTargetModel
    {
        [Key]
        public int LineTargetModelId { get; set; }

        [Required]
        public int LineNumber { get; set; }

        [Required]
        [MaxLength(20)]
        public string GenerationNo { get; set; } = "3.5";

        [Required]
        [MaxLength(255)]
        public string TargetModelName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? SetByUser { get; set; }

        public DateTime SetDate { get; set; } = DateTime.Now;

        public DateTime LastUpdated { get; set; } = DateTime.Now;

        [MaxLength(500)]
        public string? Notes { get; set; }
    }
}

