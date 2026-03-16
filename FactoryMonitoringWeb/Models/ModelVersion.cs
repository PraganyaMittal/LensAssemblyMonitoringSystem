using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{

    public class ModelVersion
    {
        [Key]
        public int ModelVersionId { get; set; }

        [Required]
        public int ModelFileId { get; set; }

        [ForeignKey("ModelFileId")]
        public virtual ModelFile ModelFile { get; set; } = default!;

        [Required]
        public int VersionNumber { get; set; }

        [Required]
        [StringLength(500)]
        public string StoragePath { get; set; } = string.Empty;

        [Required]
        [StringLength(64)]
        public string Checksum { get; set; } = string.Empty;

        [Required]
        public long FileSize { get; set; }

        public DateTime CreatedDate { get; set; } = DateTime.Now;

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [StringLength(500)]
        public string? ChangeSummary { get; set; }
    }
}

