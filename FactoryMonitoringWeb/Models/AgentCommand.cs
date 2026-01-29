using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FactoryMonitoringWeb.Models
{
    public class AgentCommand
    {
        [Key]
        public int CommandId { get; set; }

        [Required]
        public int MCId { get; set; }

        [Required]
        [StringLength(50)]
        public string CommandType { get; set; } = string.Empty; // 'UpdateConfig', 'ChangeModel', 'DownloadModel', 'DeleteModel', 'UploadModel'

        public string? CommandData { get; set; }

        [StringLength(20)]
        public string Status { get; set; } = "Pending"; // 'Pending', 'InProgress', 'Completed', 'Failed'

        public DateTime CreatedDate { get; set; } = DateTime.Now;

        public DateTime? ExecutedDate { get; set; }

        public string? ResultData { get; set; }

        public string? ErrorMessage { get; set; }

        // Navigation property
        [ForeignKey("MCId")]
        public virtual FactoryMC? FactoryMC { get; set; }
    }
}
