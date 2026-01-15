using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace FactoryMonitoringWeb.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class LogAnalyzerController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<LogAnalyzerController> _logger;
        private readonly ILogService _logService;

        public LogAnalyzerController(
            FactoryDbContext context, 
            ILogger<LogAnalyzerController> logger, 
            ILogService logService)
        {
            _context = context;
            _logger = logger;
            _logService = logService;
        }

        [HttpGet("structure/{pcId}")]
        public async Task<ActionResult<object>> GetLogStructure(int pcId)
        {
            var pc = await _context.FactoryPCs.FindAsync(pcId);
            if (pc == null) return NotFound(new { error = "PC not found" });

            string rawJson = string.IsNullOrEmpty(pc.LogStructureJson) ? "[]" : pc.LogStructureJson;

            string responseJson = $@"{{
                ""pcId"": {pcId},
                ""rootPath"": {JsonConvert.ToString(pc.LogFolderPath)}, 
                ""files"": {rawJson}
            }}";

            return Content(responseJson, "application/json");
        }

        /// <summary>
        /// Get log file content with caching, concurrent request deduplication, and no database polling.
        /// </summary>
        [HttpPost("file/{pcId}")]
        public async Task<ActionResult<object>> GetLogFileContent(int pcId, [FromBody] LogFileRequest request)
        {
            try
            {
                var pc = await _context.FactoryPCs.FindAsync(pcId);
                if (pc == null)
                    return NotFound(new { error = "PC not found" });

                // Use LogService (same request tracking as upload endpoint)
                var result = await _logService.GetLogContentAsync(pcId, request.FilePath);

                if (!result.Success)
                    return StatusCode(408, new { error = result.ErrorMessage });

                return Ok(new
                {
                    fileName = result.FileName,
                    filePath = result.FilePath,
                    content = result.Content,
                    size = result.OriginalSize,
                    encoding = "UTF-8"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetLogFileContent failed for PC {pcId}", pcId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Analyze log file (parse operations/barrels).
        /// </summary>
        [HttpPost("analyze/{pcId}")]
        public async Task<ActionResult<object>> AnalyzeLogFile(int pcId, [FromBody] LogFileRequest request)
        {
            try
            {
                var pc = await _context.FactoryPCs.FindAsync(pcId);
                if (pc == null)
                    return NotFound(new { error = "PC not found" });

                // Use LogService (same request tracking as upload endpoint)
                var result = await _logService.GetLogContentAsync(pcId, request.FilePath);

                if (!result.Success)
                    return StatusCode(408, new { error = result.ErrorMessage });

                return Ok(ParseEnhancedLogFile(result.Content));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AnalyzeLogFile failed for PC {pcId}", pcId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Download log file as attachment.
        /// </summary>
        [HttpPost("download/{pcId}")]
        public async Task<IActionResult> DownloadLogFile(int pcId, [FromBody] LogFileRequest request)
        {
            try
            {
                var pc = await _context.FactoryPCs.FindAsync(pcId);
                if (pc == null)
                    return NotFound();

                // Use LogService (same request tracking as upload endpoint)
                var result = await _logService.GetLogContentAsync(pcId, request.FilePath);

                if (!result.Success)
                    return StatusCode(408);

                var bytes = Encoding.UTF8.GetBytes(result.Content);
                return File(bytes, "text/plain", Path.GetFileName(request.FilePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DownloadLogFile failed for PC {pcId}", pcId);
                return StatusCode(500);
            }
        }

        // ===================== PARSER =====================
        private static string? ExtractJson(string line)
        {
            int first = line.IndexOf('{');
            int last = line.LastIndexOf('}');
            if (first >= 0 && last > first)
                return line.Substring(first, last - first + 1);
            return null;
        }

        private static string NormalizeJson(string json)
        {
            if (json.Contains('\'') && !json.Contains('"'))
                json = json.Replace('\'', '"');

            json = Regex.Replace(json, @"\{""barrelId"":(\d+),\{", m =>
            {
                return $@"{{""barrelId"":{m.Groups[1].Value},";
            });

            return json;
        }

        private static int? ReadTimestampMs(JObject json, params string[] keys)
        {
            foreach (var key in keys)
            {
                var prop = json.Properties()
                    .FirstOrDefault(p => p.Name.Equals(key, StringComparison.OrdinalIgnoreCase));

                if (prop != null && double.TryParse(prop.Value.ToString(), out var d))
                    return (int)Math.Floor(d);
            }
            return null;
        }

        private object ParseEnhancedLogFile(string content)
        {
            var barrelMap = new Dictionary<string, BarrelData>();
            var startMap = new Dictionary<string, Dictionary<string, int>>();

            var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

            var opRegex = new Regex(@"\b(Sequence_[^\s]+)\s+(START|END)\b", RegexOptions.IgnoreCase);

            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line.StartsWith("SEM_LOG_VERSION") || line.StartsWith("DateTime")) continue;

                string? operationName = null;
                string? status = null;

                var match = opRegex.Match(line);
                if (match.Success)
                {
                    operationName = match.Groups[1].Value;
                    status = match.Groups[2].Value.ToUpperInvariant();
                }
                else
                {
                    var tabs = line.Split('\t');
                    if (tabs.Length >= 11)
                    {
                        operationName = tabs[8].Trim();
                        status = tabs[9].Trim().ToUpperInvariant();
                    }
                    else
                    {
                        continue;
                    }
                }

                var jsonText = ExtractJson(line);
                if (jsonText == null) continue;

                jsonText = NormalizeJson(jsonText);

                JObject json;
                try { json = JObject.Parse(jsonText); }
                catch { continue; }

                var barrelProp = json.Properties()
                    .FirstOrDefault(p => p.Name.Equals("barrelId", StringComparison.OrdinalIgnoreCase));

                if (barrelProp == null) continue;

                string barrelId = barrelProp.Value.ToString();

                if (!barrelMap.ContainsKey(barrelId))
                {
                    barrelMap[barrelId] = new BarrelData { BarrelId = barrelId };
                    startMap[barrelId] = new Dictionary<string, int>();
                }

                int? startTs = ReadTimestampMs(json, "startTs", "StartTs");
                int? endTs = ReadTimestampMs(json, "endTs", "EndTs");
                int idealMs = ReadTimestampMs(json, "idealMs", "IdealTs") ?? 0;

                if (status == "START" && startTs.HasValue)
                {
                    startMap[barrelId][operationName] = startTs.Value;
                }
                else if (status == "END" && endTs.HasValue)
                {
                    if (!startMap[barrelId].TryGetValue(operationName, out var start))
                        continue;

                    if (endTs.Value < start) continue;

                    var barrel = barrelMap[barrelId];

                    barrel.Operations.Add(new OperationData
                    {
                        OperationName = operationName,
                        StartTime = start,
                        EndTime = endTs.Value,
                        ActualDuration = endTs.Value - start,
                        IdealDuration = idealMs,
                        Sequence = barrel.Operations.Count + 1
                    });

                    startMap[barrelId].Remove(operationName);
                }
            }

            foreach (var barrel in barrelMap.Values)
            {
                if (barrel.Operations.Any())
                {
                    barrel.TotalExecutionTime =
                        barrel.Operations.Max(o => o.EndTime) -
                        barrel.Operations.Min(o => o.StartTime);
                }
            }

            return new
            {
                barrels = barrelMap.Values.Select(b => new
                {
                    barrelId = b.BarrelId,
                    totalExecutionTime = b.TotalExecutionTime,
                    operations = b.Operations
                }).ToList()
            };
        }
    }

    internal class BarrelData
    {
        public string BarrelId { get; set; } = "";
        public int TotalExecutionTime { get; set; }
        public List<OperationData> Operations { get; set; } = new();
    }

    internal class OperationData
    {
        public string OperationName { get; set; } = "";
        public int StartTime { get; set; }
        public int EndTime { get; set; }
        public int ActualDuration { get; set; }
        public int IdealDuration { get; set; }
        public int Sequence { get; set; }
    }

    public class LogFileRequest
    {
        public string FilePath { get; set; } = "";
    }
}
