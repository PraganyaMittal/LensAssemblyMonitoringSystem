using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using LensAssemblyMonitoringWeb.Services;
using Microsoft.AspNetCore.SignalR;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using LensAssemblyMonitoringWeb.Models.DTOs;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class YieldAlertController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly IYieldAlertService _alertService;
        private readonly IHubContext<YieldHub> _hubContext;

        public YieldAlertController(LensAssemblyDbContext context, IYieldAlertService alertService, IHubContext<YieldHub> hubContext)
        {
            _context = context;
            _alertService = alertService;
            _hubContext = hubContext;
        }

        [HttpGet("settings")]
        [ProducesResponseType(typeof(Models.Configuration.YieldAlertSettings), StatusCodes.Status200OK)]
        public async Task<ActionResult<Models.Configuration.YieldAlertSettings>> GetSettings()
        {
            var settings = await _alertService.GetSettings();
            return Ok(settings);
        }

        [HttpPost("settings")]
        [ProducesResponseType(typeof(Models.Configuration.YieldAlertSettings), StatusCodes.Status200OK)]
        public async Task<ActionResult<Models.Configuration.YieldAlertSettings>> UpdateSettings([FromBody] Models.Configuration.YieldAlertSettings settings)
        {
            await _alertService.UpdateSettings(settings);
            return Ok(settings);
        }

        /// <summary>
        /// Retrieves currently active yield alerts.
        /// </summary>
        [HttpGet("active")]
        [ProducesResponseType(typeof(List<YieldAlert>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<YieldAlert>>> GetActiveAlerts()
        {
            var alerts = await _context.YieldAlerts
                .Where(a => a.IsActive)
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync();
            return Ok(alerts);
        }

        [HttpGet("history")]
        [ProducesResponseType(typeof(List<YieldAlert>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<YieldAlert>>> GetAlertHistory([FromQuery] int days = 30)
        {
            var since = DateTime.Now.AddDays(-days);
            var alerts = await _context.YieldAlerts
                .Where(a => a.IsActive || a.CreatedAt >= since)
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync();
            return Ok(alerts);
        }

        [HttpPost("acknowledge/{id}")]
        [ProducesResponseType(typeof(YieldAlert), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<YieldAlert>> AcknowledgeAlert(int id)
        {
            var alert = await _context.YieldAlerts.FindAsync(id);
            if (alert == null) return NotFound();

            if (!alert.IsAcknowledged)
            {
                alert.IsAcknowledged = true;
                alert.AcknowledgedAt = DateTime.Now;

                await _context.SaveChangesAsync();

                await _hubContext.Clients.All.SendAsync("AcknowledgeAlert", alert.Id);
            }

            return Ok(alert);
        }

        [HttpPost("unacknowledge/{id}")]
        [ProducesResponseType(typeof(YieldAlert), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<YieldAlert>> UnacknowledgeAlert(int id)
        {
            var alert = await _context.YieldAlerts.FindAsync(id);
            if (alert == null) return NotFound();

            if (alert.IsAcknowledged)
            {
                alert.IsAcknowledged = false;
                alert.AcknowledgedAt = null;

                await _context.SaveChangesAsync();

                await _hubContext.Clients.All.SendAsync("UnacknowledgeAlert", alert.Id);
            }

            return Ok(alert);
        }

        [HttpPost("delete/{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteAlert(int id)
        {
            await _alertService.DeleteAlert(id);
            return Ok();
        }

        [HttpPost("clear-all")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> ClearAllAlerts()
        {
            await _alertService.ClearAllAlerts();
            return Ok();
        }
    }
}

