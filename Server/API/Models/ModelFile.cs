using System.ComponentModel.DataAnnotations;

namespace LensAssemblyMonitoringWeb.Models
{

    public class ModelFile
    {
        [Key]
        public int ModelFileId { get; set; }

        [Required]
        [StringLength(255)]
        public string ModelName { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string StoragePath { get; set; } = string.Empty;

        [Required]
        [StringLength(255)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        public long FileSize { get; set; }

        [Required]
        [StringLength(64)]
        public string Checksum { get; set; } = string.Empty;

        [Required]
        [StringLength(64)]
        public string ContentHash { get; set; } = string.Empty;

        public DateTime UploadedDate { get; set; } = DateTime.Now;

        [StringLength(100)]
        public string? UploadedBy { get; set; }

        public bool IsActive { get; set; } = true;

        public bool IsTemplate { get; set; } = false;

        /// <summary>Whether this is the global default model template for new line model creation.</summary>
        public bool IsDefaultTemplate { get; set; } = false;

        [StringLength(500)]
        public string? Description { get; set; }

        [StringLength(100)]
        public string? Category { get; set; }

        public virtual ICollection<GenerationNo> GenerationNos { get; set; } = new List<GenerationNo>();
    }
}

