using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShiftController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly IYieldRepository _repository;

        public ShiftController(FactoryDbContext context, IYieldRepository repository)
        {
            _context = context;
            _repository = repository;
        }

        [HttpGet("current")]
        public async Task<IActionResult> GetCurrentShift()
        {
            var now = DateTime.Now;
            var (isDayShift, start, end) = GetShiftWindow(now);

            var summary = await GetSummaryForWindow("Current (" + (isDayShift ? "Day" : "Night") + ")", start, end);
            return Ok(summary);
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetShiftSummary([FromQuery] DateTime date)
        {
            // Day Shift: 08:00 to 20:00
            var dayStart = date.Date.AddHours(8);
            var dayEnd = date.Date.AddHours(20);

            // Night Shift: 20:00 to Next Day 08:00
            var nightStart = date.Date.AddHours(20);
            var nightEnd = date.Date.AddDays(1).AddHours(8);

            var daySummary = await GetSummaryForWindow("Day", dayStart, dayEnd);
            var nightSummary = await GetSummaryForWindow("Night", nightStart, nightEnd);

            return Ok(new DailyShiftSummary
            {
                Date = date.Date,
                DayShift = daySummary,
                NightShift = nightSummary
            });
        }

        private async Task<ShiftSummary> GetSummaryForWindow(string name, DateTime start, DateTime end)
        {
            return await _repository.GetShiftSummaryAsync(name, start, end);
        }

        private (bool isDay, DateTime start, DateTime end) GetShiftWindow(DateTime time)
        {
            // Day shift: 08:00 - 20:00
            // Night shift: 20:00 - 08:00
            
            var today8am = time.Date.AddHours(8);
            var today8pm = time.Date.AddHours(20);

            if (time >= today8am && time < today8pm)
            {
                // Day Shift
                return (true, today8am, today8pm);
            }
            else
            {
                // Night Shift
                if (time < today8am)
                {
                    // Early morning before 8am -> belongs to previous night shift (starts yesterday 8pm)
                    var yesterday8pm = time.Date.AddDays(-1).AddHours(20);
                    return (false, yesterday8pm, today8am);
                }
                else
                {
                    // Late night after 8pm -> belongs to current night shift (ends tomorrow 8am)
                    var tomorrow8am = time.Date.AddDays(1).AddHours(8);
                    return (false, today8pm, tomorrow8am);
                }
            }
        }
    }
}
