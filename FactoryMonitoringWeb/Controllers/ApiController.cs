using FactoryMonitoringWeb.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ApiController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<ApiController> _logger;

        public ApiController(FactoryDbContext context, ILogger<ApiController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // GET: api/api/versions
        [HttpGet("versions")]
        public async Task<ActionResult<IEnumerable<string>>> GetVersions()
        {
            try
            {
                var versions = await _context.FactoryMCs
                    .AsNoTracking()
                    .Select(p => p.ModelVersion)
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

        // GET: api/api/lines
        [HttpGet("lines")]
        public async Task<ActionResult<IEnumerable<int>>> GetLines()
        {
            try
            {
                var lines = await _context.FactoryMCs
                    .AsNoTracking()
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

        // GET: api/api/pcs - Route kept for API compatibility
        [HttpGet("pcs")]
        public async Task<ActionResult<object>> GetPCs([FromQuery] string? version = null, [FromQuery] int? line = null)
        {
            try
            {
                var query = _context.FactoryMCs
                    .AsNoTracking()
                    .Include(p => p.Models)
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(version))
                {
                    query = query.Where(p => p.ModelVersion == version);
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
                        p.ModelVersion,
                        p.IsOnline,
                        p.IsApplicationRunning,
                        p.LastHeartbeat,
                        p.LastUpdated,
                        CurrentModel = p.Models
                            .Where(m => m.IsCurrentModel)
                            .Select(m => new { m.ModelName, m.ModelPath })
                            .FirstOrDefault(),
                        ModelCount = p.Models.Count
                    })
                    .ToListAsync();

                // Get target models for lines in this version
                var targetModels = await _context.LineTargetModels
                    .AsNoTracking()
                    .Where(ltm => ltm.ModelVersion == version)
                    .ToDictionaryAsync(ltm => ltm.LineNumber, ltm => ltm.TargetModelName);

                // Group by line and include target model
                var grouped = mcs.GroupBy(p => p.LineNumber)
                    .Select(g => new
                    {
                        LineNumber = g.Key,
                        TargetModelName = targetModels.ContainsKey(g.Key) ? targetModels[g.Key] : null,
                        Pcs = g.ToList()  // JSON property name kept for API compatibility
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

        // GET: api/api/pc/{id} - Route kept for API compatibility
        [HttpGet("pc/{id}")]
        public async Task<ActionResult<object>> GetPC(int id)
        {
            try
            {
                var mc = await _context.FactoryMCs
                    .AsNoTracking()
                    .Include(p => p.Models)
                    .FirstOrDefaultAsync(p => p.MCId == id);

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
                    mc.ModelVersion,
                    mc.ConfigFilePath,
                    mc.LogFolderPath,
                    mc.ModelFolderPath,
                    mc.IsOnline,
                    mc.IsApplicationRunning,
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

        /// <summary>
        /// Parses the current model name from the agent's config.ini content.
        /// The config.ini uses INI format with a [current_model] section and a model= key.
        /// Example:
        ///   [current_model]
        ///   model=S24
        ///   model_path=C:\Models\S24
        /// </summary>
        private static string? ParseCurrentModelFromConfig(string? configContent)
        {
            if (string.IsNullOrWhiteSpace(configContent)) return null;
            var sectionIdx = configContent.IndexOf("[current_model]", StringComparison.OrdinalIgnoreCase);
            if (sectionIdx < 0) return null;
            // Find next section or end
            var nextSection = configContent.IndexOf("\n[", sectionIdx + 1);
            var sectionText = nextSection > 0
                ? configContent.Substring(sectionIdx, nextSection - sectionIdx)
                : configContent.Substring(sectionIdx);
            // Find line starting with "model=" (not model_path=)
            foreach (var line in sectionText.Split('\n'))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("model=", StringComparison.OrdinalIgnoreCase) &&
                    !trimmed.StartsWith("model_path=", StringComparison.OrdinalIgnoreCase) &&
                    !trimmed.StartsWith("model_version=", StringComparison.OrdinalIgnoreCase))
                {
                    var value = trimmed.Substring("model=".Length).Trim().TrimEnd('\r');
                    return string.IsNullOrEmpty(value) ? null : value;
                }
            }
            return null;
        }

        // GET: api/api/stats
        [HttpGet("stats")]
        public async Task<ActionResult<object>> GetStats()
        {
            try
            {
                var totalMCs = await _context.FactoryMCs.CountAsync();
                var onlineMCs = await _context.FactoryMCs.CountAsync(p => p.IsOnline);
                var runningApps = await _context.FactoryMCs.CountAsync(p => p.IsApplicationRunning);
                var versions = await _context.FactoryMCs
                    .GroupBy(p => p.ModelVersion)
                    .Select(g => new { Version = g.Key, Count = g.Count() })
                    .ToListAsync();
                var lines = await _context.FactoryMCs
                    .GroupBy(p => p.LineNumber)
                    .Select(g => new { Line = g.Key, Count = g.Count() })
                    .OrderBy(g => g.Line)
                    .ToListAsync();

                return Ok(new
                {
                    totalPCs = totalMCs,  // JSON kept for API compatibility
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
