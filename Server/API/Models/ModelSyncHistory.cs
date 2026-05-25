using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    /// <summary>
    /// Tracks when models were synced from machines back to the server.
    /// </summary>
    [Table("ModelSyncHistories")]
    public class ModelSyncHistory
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int LineNumber { get; set; }

        [Required]
        [MaxLength(20)]
        public string Version { get; set; } = "3.5";

        [Required]
        [MaxLength(255)]
        public string ModelName { get; set; } = default!;

        public DateTime SyncedDate { get; set; } = DateTime.Now;

        /// <summary>JSON array of MC IDs that were synced</summary>
        public string? SyncedFromMcIds { get; set; }

        [MaxLength(20)]
        public string Status { get; set; } = "Success";  // Success | Partial | Failed

        /// <summary>JSON: error details per MC if partial/failed</summary>
        public string? Details { get; set; }
    }
}
