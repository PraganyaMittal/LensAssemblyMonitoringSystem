using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LensAssemblyMonitoringWeb.Models
{
    /// <summary>
    /// Per-machine picker assignment for a line model.
    /// Each machine has up to 2 pickers, each assigned to a barrel position.
    /// </summary>
    [Table("MachinePickerConfigs")]
    public class MachinePickerConfig
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

        // --- Picker 1 ---
        public bool Picker1Enabled { get; set; } = true;

        [MaxLength(20)]
        public string? Picker1Type { get; set; }     // "Lens" | "Spacer" | "Cap"

        [MaxLength(20)]
        public string? Picker1Position { get; set; }  // "L1" | "SP0" | "Ring"

        /// <summary>JSON blob for picker 1 params (lens diameter, thickness, angle, pressure, tray dims, etc.)</summary>
        public string? Picker1Params { get; set; }

        // --- Picker 2 ---
        public bool Picker2Enabled { get; set; } = false;

        [MaxLength(20)]
        public string? Picker2Type { get; set; }

        [MaxLength(20)]
        public string? Picker2Position { get; set; }

        /// <summary>JSON blob for picker 2 params</summary>
        public string? Picker2Params { get; set; }

        public DateTime CreatedDate { get; set; } = DateTime.Now;
        public DateTime ModifiedDate { get; set; } = DateTime.Now;
    }
}
