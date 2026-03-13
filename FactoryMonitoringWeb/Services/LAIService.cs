using System.Text.Json;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// LAI release management service.
    /// 
    /// Architecture:
    /// - Server reads metadata (release-info.json) from shared network path via SMB.
    /// - Server stores only metadata (version, path, notes) in LAIReleases table.
    /// - Server creates DeployLAI commands for agents on the target line.
    /// - Agents pull the LAI binary directly from the shared path themselves.
    /// </summary>
    public class LAIService : ILAIService
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<LAIService> _logger;

        private const string MetadataFileName = "release-info.json";

        public LAIService(FactoryDbContext context, ILogger<LAIService> logger)
        {
            _context = context;
            _logger = logger;
        }

        // ────────────────────────────────────────────────────────────────
        // Scan: Read metadata from shared path (no binary copy)
        // ────────────────────────────────────────────────────────────────

        public async Task<LAIScanResult> ScanReleaseAsync(
            string networkPath, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(networkPath))
                return LAIScanResult.Failed("Network path is required.");

            // Normalize path
            networkPath = networkPath.TrimEnd('\\', '/');

            var metadataFilePath = Path.Combine(networkPath, MetadataFileName);

            _logger.LogInformation(
                "Scanning LAI release metadata at: {Path}", metadataFilePath);

            // Check if the shared path is reachable
            if (!Directory.Exists(networkPath))
            {
                _logger.LogWarning(
                    "Shared path not reachable: {Path}", networkPath);
                return LAIScanResult.Failed(
                    $"Verification machine at '{networkPath}' is unreachable. " +
                    "Check if the machine is powered on and the share is accessible.");
            }

            // Check if metadata file exists
            if (!File.Exists(metadataFilePath))
            {
                return LAIScanResult.Failed(
                    $"Metadata file '{MetadataFileName}' not found at '{networkPath}'. " +
                    "Ensure QA has placed the release correctly.");
            }

            try
            {
                // Read and parse the metadata JSON
                var jsonContent = await File.ReadAllTextAsync(metadataFilePath, ct);
                var metadata = JsonSerializer.Deserialize<LAIReleaseMetadata>(
                    jsonContent,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (metadata == null)
                    return LAIScanResult.Failed("Failed to parse metadata file — returned null.");

                // Validate required fields
                if (string.IsNullOrWhiteSpace(metadata.Version))
                    return LAIScanResult.Failed("Required field 'version' is missing from metadata.");

                if (string.IsNullOrWhiteSpace(metadata.PackageName))
                    return LAIScanResult.Failed("Required field 'packageName' is missing from metadata.");

                // Verify the referenced package file exists
                var packageFilePath = Path.Combine(networkPath, metadata.PackageName);
                long? fileSize = null;

                if (File.Exists(packageFilePath))
                {
                    var fileInfo = new FileInfo(packageFilePath);
                    fileSize = fileInfo.Length;
                }
                else
                {
                    _logger.LogWarning(
                        "Package file '{PackageName}' referenced in metadata not found at path",
                        metadata.PackageName);
                }

                _logger.LogInformation(
                    "Successfully scanned LAI release: v{Version}, package: {Package}",
                    metadata.Version, metadata.PackageName);

                return new LAIScanResult
                {
                    Success = true,
                    Version = metadata.Version,
                    PackageName = metadata.PackageName,
                    ReleaseNotes = metadata.ReleaseNotes,
                    BuildDate = metadata.BuildDate,
                    VerifiedBy = metadata.VerifiedBy,
                    FileSizeBytes = fileSize
                };
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse metadata JSON at {Path}", metadataFilePath);
                return LAIScanResult.Failed($"Metadata parse error: {ex.Message}");
            }
            catch (IOException ex)
            {
                _logger.LogError(ex, "IO error reading metadata at {Path}", metadataFilePath);
                return LAIScanResult.Failed($"Failed to read metadata file: {ex.Message}");
            }
        }

        // ────────────────────────────────────────────────────────────────
        // Register: Save metadata to DB + create agent commands
        // ────────────────────────────────────────────────────────────────

        public async Task<LAIRegisterResult> RegisterAndDeployAsync(
            LAIRegisterRequest request, CancellationToken ct = default)
        {
            // Validate: version not already registered for this line
            var existing = await _context.LAIReleases
                .AnyAsync(r => r.Version == request.Version
                            && r.TargetLineNumber == request.TargetLineNumber, ct);

            if (existing)
            {
                return LAIRegisterResult.Failed(
                    $"LAI v{request.Version} is already registered for Line {request.TargetLineNumber}.");
            }

            // Get all MCs on the target line
            var targetMCs = await _context.FactoryMCs
                .Where(mc => mc.LineNumber == request.TargetLineNumber)
                .OrderBy(mc => mc.MCNumber)
                .ToListAsync(ct);

            if (targetMCs.Count == 0)
            {
                return LAIRegisterResult.Failed(
                    $"No machines found on Line {request.TargetLineNumber}.");
            }

            // Create the LAI release record (metadata only)
            var release = new LAIRelease
            {
                Version = request.Version,
                SharedPath = request.NetworkPath.TrimEnd('\\', '/'),
                PackageName = request.PackageName,
                ReleaseNotes = request.ReleaseNotes,
                TargetLineNumber = request.TargetLineNumber,
                RegisteredBy = request.RegisteredBy,
                RegisteredDateUtc = DateTime.UtcNow,
                Status = "Deploying"
            };

            _context.LAIReleases.Add(release);
            await _context.SaveChangesAsync(ct);

            // Create DeployLAI agent commands for each MC on the line
            var commandData = JsonSerializer.Serialize(new
            {
                laiReleaseId = release.LAIReleaseId,
                sharedPath = release.SharedPath,
                packageName = release.PackageName,
                version = release.Version
            });

            foreach (var mc in targetMCs)
            {
                var command = new AgentCommand
                {
                    MCId = mc.MCId,
                    CommandType = "DeployLAI",
                    CommandData = commandData,
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };
                _context.AgentCommands.Add(command);
            }

            await _context.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Registered LAI v{Version} for Line {Line} — {Count} agent commands created",
                release.Version, request.TargetLineNumber, targetMCs.Count);

            return new LAIRegisterResult
            {
                Success = true,
                LAIReleaseId = release.LAIReleaseId,
                TargetMCCount = targetMCs.Count
            };
        }

        // ────────────────────────────────────────────────────────────────
        // History: Get LAI releases for a line
        // ────────────────────────────────────────────────────────────────

        public async Task<IList<LAIRelease>> GetReleasesForLineAsync(
            int lineNumber, CancellationToken ct = default)
        {
            return await _context.LAIReleases
                .Where(r => r.TargetLineNumber == lineNumber)
                .OrderByDescending(r => r.RegisteredDateUtc)
                .ToListAsync(ct);
        }

        // ────────────────────────────────────────────────────────────────
        // Internal: Metadata file schema
        // ────────────────────────────────────────────────────────────────

        private class LAIReleaseMetadata
        {
            public string? Version { get; set; }
            public string? PackageName { get; set; }
            public string? ReleaseNotes { get; set; }
            public string? BuildDate { get; set; }
            public string? VerifiedBy { get; set; }
        }
    }
}
