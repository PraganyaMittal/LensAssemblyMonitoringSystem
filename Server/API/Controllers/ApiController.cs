using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models.DTOs;
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

        /// <summary>
        /// Retrieves a list of all unique MC generation versions currently active.
        /// </summary>
        [HttpGet("versions")]
        [ProducesResponseType(typeof(IEnumerable<string>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
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
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Failed to retrieve versions",
                    ErrorCode = "versions_retrieval_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves a list of all active line numbers.
        /// </summary>
        [HttpGet("lines")]
        [ProducesResponseType(typeof(IEnumerable<int>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
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
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Failed to retrieve lines",
                    ErrorCode = "lines_retrieval_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves a structured list of all MCs grouped by line, optionally filtered by version and line.
        /// </summary>
        [HttpGet("pcs")]
        [ProducesResponseType(typeof(PcListResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PcListResponseDto>> GetPCs([FromQuery] string? version = null, [FromQuery] int? line = null)
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
                    .Select(p => new PcSummaryDto
                    {
                        MCId = p.MCId,
                        LineNumber = p.LineNumber,
                        MCNumber = p.MCNumber,
                        IPAddress = p.IPAddress,
                        GenerationNo = p.GenerationNo,
                        IsOnline = p.IsOnline,
                        IsApplicationRunning = p.IsApplicationRunning,
                        LifecycleState = p.LifecycleState,
                        AgentVersion = p.AgentVersion,
                        ServiceVersion = p.ServiceVersion,
                        LastHeartbeat = p.LastHeartbeat,
                        LastUpdated = p.LastUpdated,
                        CurrentModel = p.Models
                            .Where(m => m.IsCurrentModel)
                            .Select(m => new PcCurrentModelDto
                            {
                                ModelName = m.ModelName,
                                ModelPath = m.ModelPath
                            })
                            .FirstOrDefault(),
                        ModelCount = p.Models.Count
                    })
                    .ToListAsync();

                var targetModels = await _context.LineTargetModels
                    .AsNoTracking()
                    .Where(ltm => ltm.GenerationNo == version)
                    .ToDictionaryAsync(ltm => ltm.LineNumber, ltm => ltm.TargetModelName);

                var grouped = mcs.GroupBy(p => p.LineNumber)
                    .Select(g => new PcLineGroupDto
                    {
                        LineNumber = g.Key,
                        TargetModelName = targetModels.ContainsKey(g.Key) ? targetModels[g.Key] : null,
                        Pcs = g.ToList()  
                    })
                    .OrderBy(g => g.LineNumber)
                    .ToList();

                return Ok(new PcListResponseDto
                {
                    Total = mcs.Count,
                    Online = mcs.Count(p => p.IsOnline),
                    Offline = mcs.Count(p => !p.IsOnline),
                    Lines = grouped
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving MCs");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Failed to retrieve MCs",
                    ErrorCode = "pcs_retrieval_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves detailed information for a specific machine controller by ID.
        /// </summary>
        [HttpGet("pc/{id}")]
        [ProducesResponseType(typeof(PcDetailsResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PcDetailsResponseDto>> GetPC(int id)
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
                    return NotFound(new ErrorResponse
                    {
                        Message = "MC not found",
                        ErrorCode = "mc_not_found"
                    });
                }

                return Ok(new PcDetailsResponseDto
                {
                    MCId = mc.MCId,
                    LineNumber = mc.LineNumber,
                    MCNumber = mc.MCNumber,
                    IPAddress = mc.IPAddress,
                    GenerationNo = mc.GenerationNo,
                    ConfigFilePath = mc.ConfigFilePath,
                    LogFolderPath = mc.LogFolderPath,
                    ModelFolderPath = mc.ModelFolderPath,
                    IsOnline = mc.IsOnline,
                    IsApplicationRunning = mc.IsApplicationRunning,
                    AgentVersion = mc.AgentVersion,
                    ServiceVersion = mc.ServiceVersion,
                    LifecycleState = mc.LifecycleState,
                    LifecycleError = mc.LifecycleError,
                    LastHeartbeat = mc.LastHeartbeat,
                    RegisteredDate = mc.RegisteredDate,
                    LastUpdated = mc.LastUpdated,
                    ModelCount = mc.Models.Count,
                    Config = null,
                    CurrentModel = mc.Models
                        .Where(m => m.IsCurrentModel)
                        .Select(m => new PcCurrentModelDto
                        {
                            ModelId = m.ModelId,
                            ModelName = m.ModelName,
                            ModelPath = m.ModelPath,
                            LastUsed = m.LastUsed
                        })
                        .FirstOrDefault(),
                    AvailableModels = mc.Models
                        .OrderBy(m => m.ModelName)
                        .Select(m => new PcAvailableModelDto
                        {
                            ModelId = m.ModelId,
                            ModelName = m.ModelName,
                            ModelPath = m.ModelPath,
                            IsCurrentModel = m.IsCurrentModel,
                            DiscoveredDate = m.DiscoveredDate,
                            LastUsed = m.LastUsed
                        })
                        .ToList(),
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving MC {id}");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Failed to retrieve MC details",
                    ErrorCode = "mc_details_retrieval_failed"
                });
            }
        }

        /// <summary>
        /// Retrieves summary statistics about the agent network including online status, versions, and lines.
        /// </summary>
        [HttpGet("stats")]
        [ProducesResponseType(typeof(NetworkStatsResponseDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<NetworkStatsResponseDto>> GetStats()
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
                    .Select(g => new VersionCountDto { Version = g.Key, Count = g.Count() })
                    .ToListAsync();
                var lines = await _context.LensAssemblyMCs
                    .Where(p => p.LifecycleState != "Decommissioned")
                    .GroupBy(p => p.LineNumber)
                    .Select(g => new LineCountDto { Line = g.Key, Count = g.Count() })
                    .OrderBy(g => g.Line)
                    .ToListAsync();

                return Ok(new NetworkStatsResponseDto
                {
                    TotalPCs = totalMCs,
                    OnlinePCs = onlineMCs,
                    OfflinePCs = totalMCs - onlineMCs,
                    RunningApps = runningApps,
                    Versions = versions,
                    Lines = lines
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving stats");
                return StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse
                {
                    Message = "Failed to retrieve statistics",
                    ErrorCode = "stats_retrieval_failed"
                });
            }
        }
    }
}

