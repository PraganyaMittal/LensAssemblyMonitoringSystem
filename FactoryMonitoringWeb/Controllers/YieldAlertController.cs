using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using FactoryMonitoringWeb.Services;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class YieldAlertController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly IYieldAlertService _alertService;

        public YieldAlertController(FactoryDbContext context, IYieldAlertService alertService)
        {
            _context = context;
            _alertService = alertService;
        }

        [HttpGet("settings")]
        public async Task<IActionResult> GetSettings()
        {
            var settings = await _alertService.GetSettings();
            return Ok(settings);
        }

        [HttpPost("settings")]
        public async Task<IActionResult> UpdateSettings([FromBody] Models.Configuration.YieldAlertSettings settings)
        {
            await _alertService.UpdateSettings(settings);
            return Ok(settings);
        }

        [HttpGet("active")]
        public async Task<IActionResult> GetActiveAlerts()
        {
            var alerts = await _context.YieldAlerts
                .Where(a => a.IsActive)
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync();
            return Ok(alerts);
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetAlertHistory([FromQuery] int days = 30)
        {
            var since = DateTime.Now.AddDays(-days);
            var alerts = await _context.YieldAlerts
                .Where(a => a.CreatedAt >= since)
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync();
            return Ok(alerts);
        }

        [HttpPost("acknowledge/{id}")]
        public async Task<IActionResult> AcknowledgeAlert(int id)
        {
            var alert = await _context.YieldAlerts.FindAsync(id);
            if (alert == null) return NotFound();

            if (!alert.IsAcknowledged)
            {
                alert.IsAcknowledged = true;
                alert.AcknowledgedAt = DateTime.Now;
                await _context.SaveChangesAsync();
            }

            return Ok(alert);
        }
    }
}
