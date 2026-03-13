using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Represents a version of a ModelFile.
    /// Binary data is stored on disk at StoragePath — NOT in the database.
    /// </summary>
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

        // REMOVED: byte[] FileData — binaries now stored on disk

        /// <summary>
        /// Relative path to the versioned zip file on disk, e.g. "models/42/v3.zip"
        /// </summary>
        [Required]
        [StringLength(500)]
        public string StoragePath { get; set; } = string.Empty;

        /// <summary>
        /// SHA-256 hex string for integrity verification.
        /// </summary>
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
