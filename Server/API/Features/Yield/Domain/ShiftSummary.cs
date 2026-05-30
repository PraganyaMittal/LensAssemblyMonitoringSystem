using System;

namespace LensAssemblyMonitoringWeb.Features.Yield.Domain
{
    public class ShiftSummary
    {
        public string ShiftName { get; set; } = string.Empty;
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public int TotalProcessed { get; set; }
        public int TotalGood { get; set; }
        public double AverageYield { get; set; }
        public int TrayCount { get; set; }
    }

    public class DailyShiftSummary
    {
        public DateTime Date { get; set; }
        public ShiftSummary DayShift { get; set; } = new();
        public ShiftSummary NightShift { get; set; } = new();
    }
}



