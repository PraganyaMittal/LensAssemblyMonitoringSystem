using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    public class YieldRecord
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        public int MachineId { get; set; }
        
        [MaxLength(100)]
        public string TrayId { get; set; } = string.Empty;

        [Column(TypeName = "date")]
        public DateTime Date { get; set; } = DateTime.Now;

        public int GoodCount { get; set; }
        public int TotalCount { get; set; }
        public double YieldPercentage { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}

