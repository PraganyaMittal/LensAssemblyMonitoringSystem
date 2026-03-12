using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Repositories;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [EnableRateLimiting("ui_polling")]
    public class YieldController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly IHubContext<YieldHub> _hubContext;
        private readonly IYieldAlertService _alertService;
        private readonly IYieldRepository _repository;

        private readonly ILogger<YieldController> _logger;

        public YieldController(FactoryDbContext context, IHubContext<YieldHub> hubContext, IYieldAlertService alertService, IYieldRepository repository, ILogger<YieldController> logger)
        {
            _context = context;
            _hubContext = hubContext;
            _alertService = alertService;
            _repository = repository;
            _logger = logger;
        }

        public class YieldReportDto
        {
            public int MapId { get; set; } // MapId or MachineId? Model has MachineId. DTO from Agent sends "machineId". 
            // Agent sends {"machineId": 1 ...}. Json property name matching is CamelCase by default in Program.cs.
            // So C# property should be MachineId.
            public int MachineId { get; set; }
            public string TrayId { get; set; }
            public int GoodCount { get; set; }
            public int TotalCount { get; set; }
            public double YieldPercentage { get; set; }
            public DateTime? Date { get; set; }
        }

        [DisableRateLimiting]
        [HttpPost("report")]
        public async Task<IActionResult> ReportYield([FromBody] YieldReportDto dto)
        {
            if (dto == null) return BadRequest();

            // 1. Process Record (Upsert via Raw SQL Repository)
            var reportDate = (dto.Date ?? DateTime.Now).Date; // Strip time
            
            await _repository.ReportYieldAsync(
                dto.MachineId, 
                dto.TrayId, 
                reportDate, 
                dto.GoodCount, 
                dto.TotalCount, 
                dto.YieldPercentage
            );

            _logger.LogInformation("Received Report: MC={MCId}, Yield={Yield}%, Tray={Tray}", dto.MachineId, dto.YieldPercentage, dto.TrayId);

            // 2. Calculate Current 24h Yield (Weighted Average)
            // Default 24h window - Logic mostly relevant for today's yield
            // 2. Calculate Current Yield based on Settings
            var settings = await _alertService.GetSettings();
            var endTime = DateTime.Now;
            var startTime = DateTime.Today; // Default

            if (settings != null)
            {
                switch (settings.DateMode)
                {
                    case "last1":
                        startTime = DateTime.Today.AddDays(-1);
                        break;
                    case "last7":
                        startTime = DateTime.Today.AddDays(-7);
                        break;
                    case "last30":
                        startTime = DateTime.Today.AddDays(-30);
                        break;
                    case "custom":
                        if (settings.CustomFrom.HasValue) startTime = settings.CustomFrom.Value;
                        if (settings.CustomTo.HasValue) endTime = settings.CustomTo.Value.Date.AddDays(1).AddTicks(-1);
                        break;
                    case "today":
                    default:
                        startTime = DateTime.Today;
                        break;
                }
            }

            _logger.LogInformation("Yield Calc Config: Mode={Mode}, Start={Start}, End={End}, SettingsNull={SNull}", 
                settings?.DateMode, startTime, endTime, settings == null);
            var yieldsData = await _context.YieldRecords.AsNoTracking()
                .Where(r => r.MachineId == dto.MachineId && r.Date >= startTime && r.Date <= endTime)
                .Select(r => new { r.GoodCount, r.TotalCount })
                .ToListAsync();

            long sumGood = yieldsData.Sum(r => (long)r.GoodCount);
            long sumTotal = yieldsData.Sum(r => (long)r.TotalCount);

            double weightedYield = sumTotal > 0 ? ((double)sumGood / sumTotal) * 100.0 : 0.0;

            // 3. Broadcast — but only if we have actual data
            // If sumTotal == 0, this machine has no records in the date range.
            // Broadcasting 0% would briefly flash "0%" in the UI before real data arrives.
            if (sumTotal > 0)
            {
                await _hubContext.Clients.All.SendAsync("ReceiveYieldUpdate", dto.MachineId, weightedYield);
            }

            // 4. Check for Alerts (FIRE AND FORGET to avoid blocking response)
            // Skip entirely when there are no records — can't alert on nothing.
            if (sumTotal == 0)
            {
                _logger.LogInformation("Yield alert check SKIPPED (no records in range): MC={MCId}", dto.MachineId);
                return Ok(new { success = true, current24hYield = weightedYield });
            }

            // Fetch required data using current context BEFORE it gets disposed
            var mcInfo = await _context.FactoryMCs
                .AsNoTracking()
                .Where(m => m.MCId == dto.MachineId)
                .Select(m => new { MachineName = "Line " + m.LineNumber + " - MC " + m.MCNumber, m.LineNumber })
                .FirstOrDefaultAsync();

            if (mcInfo != null)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        // CheckYield uses IServiceScopeFactory internally, so it's safe
                        await _alertService.CheckYield(dto.MachineId, mcInfo.MachineName, mcInfo.LineNumber, weightedYield, startTime, endTime, sumTotal);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error checking yield alert: {ex.Message}");
                    }
                });
            }

            return Ok(new { success = true, current24hYield = weightedYield });
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary([FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            // Use exact dates passed from frontend
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date; 

            var result = await _repository.GetYieldSummaryAsync(startTime, endTime);
            return Ok(result);
        }

        [HttpGet("history/{mcId}")]
        public async Task<IActionResult> GetHistory(int mcId, [FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            // Use exact date range from frontend
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date;

            var history = await _repository.GetYieldHistoryAsync(mcId, startTime, endTime);
            return Ok(history);
        }

        /// <summary>
        /// Returns daily aggregated summaries (for large date ranges).
        /// Only returns one row per day with totals - much more efficient than fetching all trays.
        /// </summary>
        [HttpGet("history/{mcId}/summary")]
        public async Task<IActionResult> GetHistorySummary(int mcId, [FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date;

            var dailySummaries = await _context.YieldRecords
                .AsNoTracking()
                .Where(r => r.MachineId == mcId && r.Date >= startTime && r.Date <= endTime)
                .GroupBy(r => r.Date)
                .Select(g => new
                {
                    Date = g.Key,
                    TrayCount = g.Count(),
                    TotalGood = g.Sum(x => x.GoodCount),
                    TotalCount = g.Sum(x => x.TotalCount),
                    AvgYield = g.Sum(x => x.TotalCount) > 0 
                        ? (double)g.Sum(x => x.GoodCount) / g.Sum(x => x.TotalCount) * 100.0 
                        : 0.0
                })
                .OrderByDescending(x => x.Date)
                .ToListAsync();

            return Ok(dailySummaries);
        }

        /// <summary>
        /// Returns tray-level details for a specific date only.
        /// Used for lazy-loading when user expands a date in the history view.
        /// </summary>
        [HttpGet("history/{mcId}/date/{date}")]
        public async Task<IActionResult> GetHistoryByDate(int mcId, DateTime date)
        {
            var targetDate = date.Date;

            var trays = await _context.YieldRecords
                .AsNoTracking()
                .Where(r => r.MachineId == mcId && r.Date == targetDate)
                .OrderBy(r => r.TrayId)
                .Select(r => new
                {
                    r.TrayId,
                    r.GoodCount,
                    r.TotalCount,
                    r.YieldPercentage
                })
                .ToListAsync();

            return Ok(trays);
        }
    }
}
