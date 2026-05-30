using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace LensAssemblyMonitoringWeb.Features.Logs.Domain
{
    [Table("MCLogStructures")]
    public class MCLogStructure
    {
        [Key]
        [ForeignKey("LensAssemblyMC")]
        public int MCId { get; set; }

        public string? LogStructureJson { get; set; }

        [JsonIgnore]
        public virtual LensAssemblyMC? LensAssemblyMC { get; set; }
    }
}



