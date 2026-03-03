using System.ComponentModel.DataAnnotations;

namespace FactoryMonitoringWeb.Models
{
    /// <summary>
    /// Key-value settings for Update Management, stored in DB
    /// so operators can change them from the UI without restarts.
    /// </summary>
    public class UpdateSetting
    {
        [Key]
        [StringLength(100)]
        public string SettingKey { get; set; } = string.Empty;

        [Required]
        [StringLength(500)]
        public string SettingValue { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }

        public DateTime LastModified { get; set; } = DateTime.UtcNow;
    }
}
