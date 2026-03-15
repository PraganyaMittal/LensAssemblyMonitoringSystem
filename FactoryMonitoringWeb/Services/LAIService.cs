using System.Text.Json;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{

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

        
        
        

        public async Task<LAIScanResult> ScanReleaseAsync(
            string networkPath, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(networkPath))
                return LAIScanResult.Failed("Network path is required.");

            
            networkPath = networkPath.TrimEnd('\\', '/');

            var metadataFilePath = Path.Combine(networkPath, MetadataFileName);

            _logger.LogInformation(
                "Scanning LAI release metadata at: {Path}", metadataFilePath);

            
            if (!Directory.Exists(networkPath))
            {
                _logger.LogWarning(
                    "Shared path not reachable: {Path}", networkPath);
                return LAIScanResult.Failed(
                    $"Verification machine at '{networkPath}' is unreachable. " +
                    "Check if the machine is powered on and the share is accessible.");
            }

            
            if (!File.Exists(metadataFilePath))
            {
                return LAIScanResult.Failed(
                    $"Metadata file '{MetadataFileName}' not found at '{networkPath}'. " +
                    "Ensure QA has placed the release correctly.");
            }

            try
            {
                
                var jsonContent = await File.ReadAllTextAsync(metadataFilePath, ct);
                var metadata = JsonSerializer.Deserialize<LAIReleaseMetadata>(
                    jsonContent,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (metadata == null)
                    return LAIScanResult.Failed("Failed to parse metadata file â€” returned null.");

                
                if (string.IsNullOrWhiteSpace(metadata.Version))
                    return LAIScanResult.Failed("Required field 'version' is missing from metadata.");

                if (string.IsNullOrWhiteSpace(metadata.PackageName))
                    return LAIScanResult.Failed("Required field 'packageName' is missing from metadata.");

                
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

        
        
        

        public async Task<LAIRegisterResult> RegisterAndDeployAsync(
            LAIRegisterRequest request, CancellationToken ct = default)
        {
            
            var existing = await _context.LAIReleases
                .AnyAsync(r => r.Version == request.Version
                            && r.TargetLineNumber == request.TargetLineNumber, ct);

            if (existing)
            {
                return LAIRegisterResult.Failed(
                    $"LAI v{request.Version} is already registered for Line {request.TargetLineNumber}.");
            }

            
            var targetMCs = await _context.FactoryMCs
                .Where(mc => mc.LineNumber == request.TargetLineNumber)
                .OrderBy(mc => mc.MCNumber)
                .ToListAsync(ct);

            if (targetMCs.Count == 0)
            {
                return LAIRegisterResult.Failed(
                    $"No machines found on Line {request.TargetLineNumber}.");
            }

            
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
                "Registered LAI v{Version} for Line {Line} â€” {Count} agent commands created",
                release.Version, request.TargetLineNumber, targetMCs.Count);

            return new LAIRegisterResult
            {
                Success = true,
                LAIReleaseId = release.LAIReleaseId,
                TargetMCCount = targetMCs.Count
            };
        }

        
        
        

        public async Task<IList<LAIRelease>> GetReleasesForLineAsync(
            int lineNumber, CancellationToken ct = default)
        {
            return await _context.LAIReleases
                .Where(r => r.TargetLineNumber == lineNumber)
                .OrderByDescending(r => r.RegisteredDateUtc)
                .ToListAsync(ct);
        }

        
        
        

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

