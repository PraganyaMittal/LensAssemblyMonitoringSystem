namespace FactoryMonitoringWeb.Models.Configuration
{
    public class YieldAlertSettings
    {
        public double Threshold { get; set; } = 85.0;
        public int CooldownMinutes { get; set; } = 60;
        public int HistoryDays { get; set; } = 30;
    }
}
