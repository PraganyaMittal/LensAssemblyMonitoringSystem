using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Features.Models.Domain
{
    /// <summary>
    /// Barrel assembly configuration for a line model.
    /// Stores lens/spacer counts, assembly sequence, and barrel dimensions.
    /// </summary>
    [Table("LineBarrelConfigs")]
    public class LineBarrelConfig
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

        public int LensCount { get; set; }
        public int SpacerCount { get; set; }

        /// <summary>JSON array of assembly sequence, e.g. ["SP0","L1","L2","SP2","L3",...]</summary>
        public string? AssemblySequence { get; set; }

        /// <summary>JSON string of step parameters mapping.</summary>
        public string? StepParamsJson { get; set; }

        /// <summary>JSON string of component parameters (colors, pressures, etc).</summary>
        public string? ComponentParamsJson { get; set; }

        /// <summary>JSON string of barrel slots layout.</summary>
        public string? BarrelSlotsJson { get; set; }

        /// <summary>Total barrel length / TTL (mm)</summary>
        [Column(TypeName = "decimal(10,4)")]
        public decimal? TTL { get; set; }

        /// <summary>Barrel tray X dimension</summary>
        public int? TrayDimX { get; set; }

        /// <summary>Barrel tray Y dimension</summary>
        public int? TrayDimY { get; set; }

        /// <summary>Number of machines this model covers</summary>
        public int MachineCount { get; set; }

        public DateTime CreatedDate { get; set; } = DateTime.Now;
        public DateTime ModifiedDate { get; set; } = DateTime.Now;
    }
}


