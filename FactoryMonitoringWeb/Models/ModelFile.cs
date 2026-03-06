using System.ComponentModel.DataAnnotations;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Represents a model in the central library.
    /// Binary data is stored on disk at StoragePath — NOT in the database.
    /// </summary>
    public class ModelFile
    {
        [Key]
        public int ModelFileId { get; set; }

        [Required]
        [StringLength(255)]
        public string ModelName { get; set; } = string.Empty;

        // REMOVED: byte[] FileData — binaries now stored on disk
        // The file lives at: {StorageRoot}/{StoragePath}

        /// <summary>
        /// Relative path to the zip file on disk, e.g. "models/42/v1.zip"
        /// </summary>
        [Required]
        [StringLength(500)]
        public string StoragePath { get; set; } = string.Empty;

        [Required]
        [StringLength(255)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        public long FileSize { get; set; }

        /// <summary>
        /// SHA-256 hex string for integrity verification on download.
        /// </summary>
        [Required]
        [StringLength(64)]
        public string Checksum { get; set; } = string.Empty;

        /// <summary>
        /// SHA-256 of file content for deduplication.
        /// Two files with the same ContentHash are identical.
        /// </summary>
        [Required]
        [StringLength(64)]
        public string ContentHash { get; set; } = string.Empty;

        public DateTime UploadedDate { get; set; } = DateTime.Now;

        [StringLength(100)]
        public string? UploadedBy { get; set; }

        public bool IsActive { get; set; } = true;

        // Model Library Enhancement
        public bool IsTemplate { get; set; } = false;

        [StringLength(500)]
        public string? Description { get; set; }

        [StringLength(100)]
        public string? Category { get; set; }

        // Navigation properties
        public virtual ICollection<ModelDistribution> ModelDistributions { get; set; } = new List<ModelDistribution>();
        public virtual ICollection<ModelVersion> ModelVersions { get; set; } = new List<ModelVersion>();
    }
}
