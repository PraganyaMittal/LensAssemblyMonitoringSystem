using FactoryMonitoringWeb.Controllers.Hubs;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
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
    public class YieldController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly IHubContext<YieldHub> _hubContext;

        public YieldController(FactoryDbContext context, IHubContext<YieldHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
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

        [HttpPost("report")]
        public async Task<IActionResult> ReportYield([FromBody] YieldReportDto dto)
        {
            if (dto == null) return BadRequest();

            // 1. Process Record (Upsert)
            // Check if we already have an entry for this Machine + Tray today (ignoring time)
            var reportDate = (dto.Date ?? DateTime.Now).Date; // Strip time: 2026-02-03 00:00:00
            
            var existingRecord = await _context.YieldRecords
                .Where(r => r.MachineId == dto.MachineId && r.TrayId == dto.TrayId && r.Date == reportDate)
                .FirstOrDefaultAsync();

            if (existingRecord != null)
            {
                // Update existing record
                existingRecord.GoodCount = dto.GoodCount;
                existingRecord.TotalCount = dto.TotalCount;
                existingRecord.YieldPercentage = dto.YieldPercentage;
                // Date remains
                existingRecord.Date = reportDate;
                
                _context.YieldRecords.Update(existingRecord);
            }
            else
            {
                // Insert new record
                var record = new YieldRecord
                {
                    MachineId = dto.MachineId,
                    TrayId = dto.TrayId,
                    GoodCount = dto.GoodCount,
                    TotalCount = dto.TotalCount,
                    YieldPercentage = dto.YieldPercentage,
                    Date = reportDate // Store Date ONLY
                };
                _context.YieldRecords.Add(record);
            }

            await _context.SaveChangesAsync();

            // 2. Calculate Current 24h Yield (Weighted Average)
            // Default 24h window - Logic mostly relevant for today's yield
            var endTime = DateTime.Now;
            var startTime = endTime.AddHours(-24);

            // Since we only have Date now (no time), specific 24h window logic is less precise for previous days.
            // But for "Current Yield", checking today's Date is usually enough.
            // Let's stick to simple Date comparison if needed, or keep range if logic permits.
            // If stored as DATE, it effectively checks Date >= StartDate AND Date <= EndDate
            
            var aggs = await _context.YieldRecords
                .Where(r => r.MachineId == dto.MachineId && r.Date >= startTime.Date && r.Date <= endTime.Date)
                .GroupBy(r => r.MachineId)
                .Select(g => new
                {
                    TotalGood = g.Sum(x => x.GoodCount),
                    TotalCount = g.Sum(x => x.TotalCount)
                })
                .FirstOrDefaultAsync();

            double weightedYield = 0.0;
            if (aggs != null && aggs.TotalCount > 0)
            {
                weightedYield = (double)aggs.TotalGood / aggs.TotalCount * 100.0;
            }

            // 3. Broadcast
            await _hubContext.Clients.All.SendAsync("ReceiveYieldUpdate", dto.MachineId, weightedYield);

            return Ok(new { success = true, current24hYield = weightedYield });
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary([FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            // Use exact dates passed from frontend - do NOT default to yesterday
            // Frontend always passes the correct date range based on user's selection
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date; // Default to same day (today) if not specified

            var data = await _context.YieldRecords
                .Where(r => r.Date >= startTime && r.Date <= endTime)
                .GroupBy(r => r.MachineId)
                .Select(g => new
                {
                    MachineId = g.Key,
                    TotalGood = g.Sum(x => x.GoodCount),
                    TotalCount = g.Sum(x => x.TotalCount)
                })
                .ToListAsync();

            var result = data.ToDictionary(
                k => k.MachineId,
                v => v.TotalCount > 0 ? (double)v.TotalGood / v.TotalCount * 100.0 : 0.0
            );

            return Ok(result);
        }

        [HttpGet("history/{mcId}")]
        public async Task<IActionResult> GetHistory(int mcId, [FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            // Use exact date range from frontend
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date; // Default to same day if not specified

            var history = await _context.YieldRecords
                .Where(r => r.MachineId == mcId && r.Date >= startTime && r.Date <= endTime)
                .OrderByDescending(r => r.Date)
                .Select(r => new {
                    r.TrayId,
                    Date = r.Date,
                    r.GoodCount,
                    r.TotalCount,
                    r.YieldPercentage
                })
                .ToListAsync();

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
