using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Features.Logs.Services;
using LensAssemblyMonitoringWeb.Features.Yield.Services;
using LensAssemblyMonitoringWeb.Shared.FileSystem;
using LensAssemblyMonitoringWeb.Features.Yield.Data;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace LensAssemblyMonitoringWeb.Features.Yield.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [EnableRateLimiting("ui_polling")]
    public class YieldController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly IHubContext<YieldHub> _hubContext;
        private readonly IYieldAlertService _alertService;
        private readonly IYieldRepository _repository;

        private readonly ILogger<YieldController> _logger;

        public YieldController(LensAssemblyDbContext context, IHubContext<YieldHub> hubContext, IYieldAlertService alertService, IYieldRepository repository, ILogger<YieldController> logger)
        {
            _context = context;
            _hubContext = hubContext;
            _alertService = alertService;
            _repository = repository;
            _logger = logger;
        }

        public class YieldReportDto
        {
            public int MapId { get; set; } 

            public int MachineId { get; set; }
            public string TrayId { get; set; } = string.Empty;
            public int GoodCount { get; set; }
            public int TotalCount { get; set; }
            public double YieldPercentage { get; set; }
            public DateTime? Date { get; set; }
        }

        /// <summary>
        /// Receives yield reports (good vs total count) from an agent.
        /// </summary>
        [DisableRateLimiting]
        [HttpPost("report")]
        [ProducesResponseType(typeof(YieldReportResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<YieldReportResponse>> ReportYield([FromBody] YieldReportDto dto)
        {
            if (dto == null) return BadRequest();

            var reportDate = (dto.Date ?? DateTime.Now).Date; 
            
            await _repository.ReportYieldAsync(
                dto.MachineId, 
                dto.TrayId, 
                reportDate, 
                dto.GoodCount, 
                dto.TotalCount, 
                dto.YieldPercentage
            );

            _logger.LogInformation("Received Report: MC={MCId}, Yield={Yield}%, Tray={Tray}", dto.MachineId, dto.YieldPercentage, dto.TrayId);

            var settings = await _alertService.GetSettings();
            var endTime = DateTime.Now;
            var startTime = DateTime.Today; 

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

            if (sumTotal > 0)
            {
                await _hubContext.Clients.All.SendAsync("ReceiveYieldUpdate", dto.MachineId, weightedYield);
            }

            if (sumTotal == 0)
            {
                _logger.LogInformation("Yield alert check SKIPPED (no records in range): MC={MCId}", dto.MachineId);
                return Ok(new YieldReportResponse { Success = true, Current24hYield = weightedYield });
            }

            var mcInfo = await _context.LensAssemblyMCs
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
                        
                        await _alertService.CheckYield(dto.MachineId, mcInfo.MachineName, mcInfo.LineNumber, weightedYield, startTime, endTime, sumTotal);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error checking yield alert: {ex.Message}");
                    }
                });
            }

            return Ok(new YieldReportResponse { Success = true, Current24hYield = weightedYield });
        }

        /// <summary>
        /// Retrieves the overall yield summary for a specified date range.
        /// </summary>
        [HttpGet("summary")]
        [ProducesResponseType(typeof(Dictionary<int, double>), StatusCodes.Status200OK)]
        public async Task<ActionResult<Dictionary<int, double>>> GetSummary([FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date; 

            var result = await _repository.GetYieldSummaryAsync(startTime, endTime);
            return Ok(result);
        }

        /// <summary>
        /// Retrieves detailed yield history for a specific machine within a date range.
        /// </summary>
        [HttpGet("history/{mcId}")]
        [ProducesResponseType(typeof(List<YieldRecord>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<YieldRecord>>> GetHistory(int mcId, [FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date;

            var history = await _repository.GetYieldHistoryAsync(mcId, startTime, endTime);
            return Ok(history);
        }

        [HttpGet("history/{mcId}/summary")]
        [ProducesResponseType(typeof(List<YieldDailySummaryDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<YieldDailySummaryDto>>> GetHistorySummary(int mcId, [FromQuery] DateTime? start, [FromQuery] DateTime? end)
        {
            var endTime = (end ?? DateTime.Now).Date;
            var startTime = (start ?? endTime).Date;

            var dailySummaries = await _context.YieldRecords
                .AsNoTracking()
                .Where(r => r.MachineId == mcId && r.Date >= startTime && r.Date <= endTime)
                .GroupBy(r => r.Date)
                .Select(g => new YieldDailySummaryDto
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

        [HttpGet("history/{mcId}/date/{date}")]
        [ProducesResponseType(typeof(List<YieldTraySummaryDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<YieldTraySummaryDto>>> GetHistoryByDate(int mcId, DateTime date)
        {
            var targetDate = date.Date;

            var trays = await _context.YieldRecords
                .AsNoTracking()
                .Where(r => r.MachineId == mcId && r.Date == targetDate)
                .OrderBy(r => r.TrayId)
                .Select(r => new YieldTraySummaryDto
                {
                    TrayId = r.TrayId,
                    GoodCount = r.GoodCount,
                    TotalCount = r.TotalCount,
                    YieldPercentage = r.YieldPercentage
                })
                .ToListAsync();

            return Ok(trays);
        }
    }
}



