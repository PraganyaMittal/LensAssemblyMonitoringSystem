using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShiftController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly IYieldRepository _repository;

        public ShiftController(LensAssemblyDbContext context, IYieldRepository repository)
        {
            _context = context;
            _repository = repository;
        }

        /// <summary>
        /// Gets the yield summary for the currently active shift window.
        /// </summary>
        [HttpGet("current")]
        [ProducesResponseType(typeof(ShiftSummary), StatusCodes.Status200OK)]
        public async Task<ActionResult<ShiftSummary>> GetCurrentShift()
        {
            var now = DateTime.Now;
            var (isDayShift, start, end) = GetShiftWindow(now);

            var summary = await GetSummaryForWindow("Current (" + (isDayShift ? "Day" : "Night") + ")", start, end);
            return Ok(summary);
        }

        /// <summary>
        /// Gets day and night shift summaries for a specific date.
        /// </summary>
        [HttpGet("summary")]
        [ProducesResponseType(typeof(DailyShiftSummary), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<DailyShiftSummary>> GetShiftSummary([FromQuery] DateTime? date)
        {
            var targetDate = (date ?? DateTime.Today).Date;

            var dayStart = targetDate.AddHours(8);
            var dayEnd = targetDate.AddHours(20);

            var nightStart = targetDate.AddHours(20);
            var nightEnd = targetDate.AddDays(1).AddHours(8);

            var daySummary = await GetSummaryForWindow("Day", dayStart, dayEnd);
            var nightSummary = await GetSummaryForWindow("Night", nightStart, nightEnd);

            return Ok(new DailyShiftSummary
            {
                Date = targetDate,
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

            var today8am = time.Date.AddHours(8);
            var today8pm = time.Date.AddHours(20);

            if (time >= today8am && time < today8pm)
            {
                
                return (true, today8am, today8pm);
            }
            else
            {
                
                if (time < today8am)
                {
                    
                    var yesterday8pm = time.Date.AddDays(-1).AddHours(20);
                    return (false, yesterday8pm, today8am);
                }
                else
                {
                    
                    var tomorrow8am = time.Date.AddDays(1).AddHours(8);
                    return (false, today8pm, tomorrow8am);
                }
            }
        }
    }
}

