using System.ComponentModel.DataAnnotations;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Represents an uploaded update package (.zip) for LAI or Agent software.
    /// Files are stored on disk with GUID names; original filename is preserved here.
    /// </summary>
    public class UpdatePackage
    {
        [Key]
        public int UpdatePackageId { get; set; }

        [Required]
        [StringLength(200)]
        public string PackageName { get; set; } = string.Empty;

        /// <summary>
        /// "LAI" or "Agent"
        /// </summary>
        [Required]
        [StringLength(20)]
        public string PackageType { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string Version { get; set; } = string.Empty;

        /// <summary>
        /// Original filename as uploaded (e.g., "lai-4.2.1.zip")
        /// </summary>
        [Required]
        [StringLength(500)]
        public string FileName { get; set; } = string.Empty;

        /// <summary>
        /// GUID-based path on disk (e.g., "uploads/packages/{guid}.zip")
        /// </summary>
        [Required]
        [StringLength(1000)]
        public string StoragePath { get; set; } = string.Empty;

        public long FileSize { get; set; }

        /// <summary>
        /// SHA-256 hash of the file computed on upload.
        /// Agents verify this after downloading.
        /// </summary>
        [Required]
        [StringLength(128)]
        public string FileHash { get; set; } = string.Empty;

        [StringLength(2000)]
        public string? Description { get; set; }

        [Required]
        [StringLength(100)]
        public string UploadedBy { get; set; } = string.Empty;

        public DateTime UploadedDate { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Soft-delete flag. Set to false instead of physical delete.
        /// </summary>
        public bool IsActive { get; set; } = true;

        /// <summary>
        /// When the package was archived (moved to trash). Null if active.
        /// Auto-purge service deletes packages after RetentionDays past this date.
        /// </summary>
        public DateTime? ArchivedDate { get; set; }

        /// <summary>
        /// Optimistic concurrency token. EF Core manages this automatically.
        /// </summary>
        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;
    }
}
