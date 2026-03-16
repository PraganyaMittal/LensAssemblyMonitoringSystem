using System.ComponentModel.DataAnnotations;

namespace FactoryMonitoringWeb.Models
{

    public class UpdatePackage
    {
        [Key]
        public int UpdatePackageId { get; set; }

        [Required]
        [StringLength(20)]
        public string PackageType { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string Version { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        [StringLength(1000)]
        public string StoragePath { get; set; } = string.Empty;

        public long FileSize { get; set; }

        [Required]
        [StringLength(128)]
        public string FileHash { get; set; } = string.Empty;

        [StringLength(2000)]
        public string? Description { get; set; }

        [Required]
        [StringLength(100)]
        public string UploadedBy { get; set; } = string.Empty;

        public DateTime UploadedDate { get; set; } = DateTime.UtcNow;

        public bool IsActive { get; set; } = true;

        public DateTime? ArchivedDate { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;
    }
}

