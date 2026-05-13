using LensAssemblyMonitoringWeb.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ApiController : ControllerBase
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<ApiController> _logger;

        public ApiController(LensAssemblyDbContext context, ILogger<ApiController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpGet("versions")]
        public async Task<ActionResult<IEnumerable<string>>> GetVersions()
        {
            try
            {
                var versions = await _context.LensAssemblyMCs
                    .AsNoTracking()
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .Select(p => p.GenerationNo)
                    .Distinct()
                    .OrderBy(v => v)
                    .ToListAsync();

                return Ok(versions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving versions");
                return StatusCode(500, new { error = "Failed to retrieve versions" });
            }
        }

        [HttpGet("lines")]
        public async Task<ActionResult<IEnumerable<int>>> GetLines()
        {
            try
            {
                var lines = await _context.LensAssemblyMCs
                    .AsNoTracking()
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .Select(p => p.LineNumber)
                    .Distinct()
                    .OrderBy(l => l)
                    .ToListAsync();

                return Ok(lines);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving lines");
                return StatusCode(500, new { error = "Failed to retrieve lines" });
            }
        }

        [HttpGet("pcs")]
        public async Task<ActionResult<object>> GetPCs([FromQuery] string? version = null, [FromQuery] int? line = null)
        {
            try
            {
                var query = _context.LensAssemblyMCs
                    .AsNoTracking()
                    .Include(p => p.Models)
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(version))
                {
                    query = query.Where(p => p.GenerationNo == version);
                }

                if (line.HasValue)
                {
                    query = query.Where(p => p.LineNumber == line.Value);
                }

                var mcs = await query
                    .OrderBy(p => p.LineNumber)
                    .ThenBy(p => p.MCNumber)
                    .Select(p => new
                    {
                        p.MCId,
                        p.LineNumber,
                        p.MCNumber,
                        p.IPAddress,
                        p.GenerationNo,
                        p.IsOnline,
                        p.IsApplicationRunning,
                        p.LifecycleState,
                        p.AgentVersion,
                        p.ServiceVersion,
                        p.LastHeartbeat,
                        p.LastUpdated,
                        CurrentModel = p.Models
                            .Where(m => m.IsCurrentModel)
                            .Select(m => new { m.ModelName, m.ModelPath })
                            .FirstOrDefault(),
                        ModelCount = p.Models.Count
                    })
                    .ToListAsync();

                var targetModels = await _context.LineTargetModels
                    .AsNoTracking()
                    .Where(ltm => ltm.GenerationNo == version)
                    .ToDictionaryAsync(ltm => ltm.LineNumber, ltm => ltm.TargetModelName);

                var grouped = mcs.GroupBy(p => p.LineNumber)
                    .Select(g => new
                    {
                        LineNumber = g.Key,
                        TargetModelName = targetModels.ContainsKey(g.Key) ? targetModels[g.Key] : null,
                        Pcs = g.ToList()  
                    })
                    .OrderBy(g => g.LineNumber)
                    .ToList();

                return Ok(new
                {
                    total = mcs.Count,
                    online = mcs.Count(p => p.IsOnline),
                    offline = mcs.Count(p => !p.IsOnline),
                    lines = grouped
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving MCs");
                return StatusCode(500, new { error = "Failed to retrieve MCs" });
            }
        }

        [HttpGet("pc/{id}")]
        public async Task<ActionResult<object>> GetPC(int id)
        {
            try
            {
                var mc = await _context.LensAssemblyMCs
                    .AsNoTracking()
                    .Include(p => p.Models)
                    .FirstOrDefaultAsync(p =>
                        p.MCId == id &&
                        p.LifecycleState != "Decommissioned");

                if (mc == null)
                {
                    return NotFound(new { error = "MC not found" });
                }

                return Ok(new
                {
                    mc.MCId,
                    mc.LineNumber,
                    mc.MCNumber,
                    mc.IPAddress,
                    mc.GenerationNo,
                    mc.ConfigFilePath,
                    mc.LogFolderPath,
                    mc.ModelFolderPath,
                    mc.IsOnline,
                    mc.IsApplicationRunning,
                    mc.AgentVersion,
                    mc.ServiceVersion,
                    mc.LifecycleState,
                    mc.LifecycleError,
                    mc.LastHeartbeat,
                    mc.RegisteredDate,
                    mc.LastUpdated,
                    CurrentModel = mc.Models
                        .Where(m => m.IsCurrentModel)
                        .Select(m => new { m.ModelId, m.ModelName, m.ModelPath, m.LastUsed })
                        .FirstOrDefault(),
                    AvailableModels = mc.Models
                        .OrderBy(m => m.ModelName)
                        .Select(m => new
                        {
                            modelId = m.ModelId,
                            modelName = m.ModelName,
                            modelPath = m.ModelPath,
                            isCurrentModel = m.IsCurrentModel,
                            discoveredDate = m.DiscoveredDate,
                            lastUsed = m.LastUsed
                        })
                        .ToList(),
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving MC {id}");
                return StatusCode(500, new { error = "Failed to retrieve MC details" });
            }
        }

        [HttpGet("stats")]
        public async Task<ActionResult<object>> GetStats()
        {
            try
            {
                var activeQuery = _context.LensAssemblyMCs
                    .Where(p => p.LifecycleState != "Decommissioned");
                var totalMCs = await activeQuery.CountAsync();
                var onlineMCs = await activeQuery.CountAsync(p => p.IsOnline);
                var runningApps = await activeQuery.CountAsync(p => p.IsApplicationRunning);
                var versions = await _context.LensAssemblyMCs
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .GroupBy(p => p.GenerationNo)
                    .Select(g => new { Version = g.Key, Count = g.Count() })
                    .ToListAsync();
                var lines = await _context.LensAssemblyMCs
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .GroupBy(p => p.LineNumber)
                    .Select(g => new { Line = g.Key, Count = g.Count() })
                    .OrderBy(g => g.Line)
                    .ToListAsync();

                return Ok(new
                {
                    totalPCs = totalMCs,  
                    onlinePCs = onlineMCs,
                    offlinePCs = totalMCs - onlineMCs,
                    runningApps,
                    versions,
                    lines
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving stats");
                return StatusCode(500, new { error = "Failed to retrieve statistics" });
            }
        }
    }
}

