namespace LensAssemblyMonitoringWeb.Features.Yield.Contracts
{
    public class YieldReportResponse
        {
            public bool Success { get; set; }
            public double Current24hYield { get; set; }
        }

    public class YieldDailySummaryDto
        {
            public DateTime Date { get; set; }
            public int TrayCount { get; set; }
            public int TotalGood { get; set; }
            public int TotalCount { get; set; }
            public double AvgYield { get; set; }
        }

    public class YieldTraySummaryDto
        {
            public string TrayId { get; set; } = string.Empty;
            public int GoodCount { get; set; }
            public int TotalCount { get; set; }
            public double YieldPercentage { get; set; }
        }
}



