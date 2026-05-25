using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    /// <summary>
    /// Maps a per-machine model file to a line model.
    /// Each machine in a line model gets its own entry pointing to a ModelFile.
    /// Phase 1: All machines point to the same base model (no derivation yet).
    /// Phase 2: Derivation engine creates distinct copies with derived spec params.
    /// </summary>
    [Table("LineModelMachineFiles")]
    public class LineModelMachineFile
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

        [Required]
        public int McNumber { get; set; }

        /// <summary>FK → ModelFiles. The base or derived model ZIP for this machine.</summary>
        public int? ModelFileId { get; set; }

        [ForeignKey("ModelFileId")]
        public ModelFile? ModelFile { get; set; }

        /// <summary>JSON: derived spec params that differ from base (Phase 2)</summary>
        public string? DerivedParams { get; set; }

        /// <summary>Pending | Derived | Deployed</summary>
        [MaxLength(20)]
        public string Status { get; set; } = "Pending";

        public DateTime CreatedDate { get; set; } = DateTime.Now;
        public DateTime ModifiedDate { get; set; } = DateTime.Now;
    }
}
