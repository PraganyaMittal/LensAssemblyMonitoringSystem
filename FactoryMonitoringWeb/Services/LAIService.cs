using System.IO.Compression;
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
                    "Ensure release older is placed correctly.");
            }

            try
            {
                var jsonContent = await File.ReadAllTextAsync(metadataFilePath, ct);
                var metadata = JsonSerializer.Deserialize<LAIReleaseMetadata>(
                    jsonContent,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (metadata == null)
                    return LAIScanResult.Failed("Failed to parse metadata file — returned null.");

                if (string.IsNullOrWhiteSpace(metadata.Version))
                    return LAIScanResult.Failed("Required field 'version' is missing from metadata.");

                // Check if the file referenced in metadata exists.
                // It usually references a file relative to the network path space
                var packageFilePath = Path.Combine(networkPath, metadata.FileName ?? "update.zip");
                long? fileSize = null;

                if (!File.Exists(packageFilePath))
                {
                    return LAIScanResult.Failed(
                        $"Package file '{metadata.FileName}' referenced in metadata not found at '{networkPath}'.");
                }

                var fileInfo = new FileInfo(packageFilePath);
                fileSize = fileInfo.Length;

                if (fileSize == 0)
                {
                    return LAIScanResult.Failed(
                        $"Package file '{metadata.FileName}' is empty (0 bytes).");
                }

                if (metadata.FileName?.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) == true)
                {
                    try
                    {
                        using var stream = File.OpenRead(packageFilePath);
                        using var archive = new System.IO.Compression.ZipArchive(stream, System.IO.Compression.ZipArchiveMode.Read);
                        var entriesCount = archive.Entries.Count;
                        if (entriesCount == 0)
                        {
                            return LAIScanResult.Failed($"Package file '{metadata.FileName}' is an empty zip archive.");
                        }
                    }
                    catch (System.IO.InvalidDataException)
                    {
                        return LAIScanResult.Failed(
                            $"Package file '{metadata.FileName}' is corrupted or not a valid zip archive.");
                    }
                    catch (Exception ex)
                    {
                        return LAIScanResult.Failed(
                            $"Could not open package file '{metadata.FileName}' for validation: {ex.Message}");
                    }
                }

                _logger.LogInformation(
                    "Successfully scanned LAI release: v{Version}, package: {Package}",
                    metadata.Version, metadata.FileName);

                return new LAIScanResult
                {
                    Success = true,
                    Version = metadata.Version,
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

        public async Task<LAIRegisterResult> RegisterAsync(
            LAIRegisterRequest request, CancellationToken ct = default)
        {
            // Check if this version already exists in the Software Library
            var existing = await _context.UpdatePackages
                .AnyAsync(p => p.PackageType == "LAI"
                            && p.Version == request.Version
                            && p.IsActive, ct);

            if (existing)
            {
                return LAIRegisterResult.Failed(
                    $"LAI v{request.Version} is already registered in the Software Library.");
            }

            // Create an UpdatePackage record with PackageType = "LAI"
            var package = new UpdatePackage
            {
                PackageType = "LAI",
                Version = request.Version,
                FileName = request.FileName ?? "update.zip", 
                StoragePath = request.NetworkPath.TrimEnd('\\', '/'),
                FileSize = 0,
                FileHash = "N/A",
                Description = request.ReleaseNotes,
                UploadedBy = request.RegisteredBy,
                UploadedDate = DateTime.UtcNow,
                IsActive = true
            };

            _context.UpdatePackages.Add(package);
            await _context.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Registered LAI v{Version} as UpdatePackage {Id} in Software Library",
                package.Version, package.UpdatePackageId);

            return new LAIRegisterResult
            {
                Success = true,
                PackageId = package.UpdatePackageId
            };
        }

        private class LAIReleaseMetadata
        {
            public string Version { get; set; } = string.Empty;
            public string? FileName { get; set; }
            public string? ReleaseNotes { get; set; }
            public string? BuildDate { get; set; }
            public string? VerifiedBy { get; set; }
        }
    }
}
