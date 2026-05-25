using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Services
{
    /// <summary>
    /// Scans and registers Bundle packages from shared network paths.
    /// Mirrors LAIService — bundles now come from shared paths instead of web uploads.
    /// Hash is computed by the web server during scan (not by the build team).
    /// </summary>
    public class BundleService : IBundleService
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<BundleService> _logger;
        private readonly ICredentialEncryptionService _encryption;

        private const string MetadataFileName = "release-info.json";

        public BundleService(LensAssemblyDbContext context, ILogger<BundleService> logger, ICredentialEncryptionService encryption)
        {
            _context = context;
            _logger = logger;
            _encryption = encryption;
        }

        public async Task<BundleScanResult> ScanReleaseAsync(
            string networkPath, string? username = null, string? password = null, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(networkPath))
                return BundleScanResult.Failed("Network path is required.");

            networkPath = networkPath.TrimEnd('\\', '/');

            if (!string.IsNullOrWhiteSpace(username))
            {
                if (!NetworkShareValidator.ValidateCredentials(networkPath, username, password ?? "", out string errorMessage))
                {
                    _logger.LogWarning("Network share validation failed for {Path}: {Error}", networkPath, errorMessage);
                    return BundleScanResult.Failed(errorMessage);
                }
            }

            var metadataFilePath = Path.Combine(networkPath, MetadataFileName);

            _logger.LogInformation(
                "Scanning Bundle release metadata at: {Path}", metadataFilePath);

            if (!Directory.Exists(networkPath))
            {
                _logger.LogWarning(
                    "Shared path not reachable: {Path}", networkPath);
                return BundleScanResult.Failed(
                    $"Shared path '{networkPath}' is unreachable. " +
                    "Check if the machine is powered on and the share is accessible.");
            }

            if (!File.Exists(metadataFilePath))
            {
                return BundleScanResult.Failed(
                    $"Metadata file '{MetadataFileName}' not found at '{networkPath}'. " +
                    "Ensure the release folder is placed correctly.");
            }

            try
            {
                var jsonContent = await File.ReadAllTextAsync(metadataFilePath, ct);
                var metadata = JsonSerializer.Deserialize<BundleReleaseMetadata>(
                    jsonContent,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (metadata == null)
                    return BundleScanResult.Failed("Failed to parse metadata file — returned null.");

                if (string.IsNullOrWhiteSpace(metadata.Version))
                    return BundleScanResult.Failed("Required field 'version' is missing from metadata.");

                var packageFileName = string.IsNullOrWhiteSpace(metadata.FileName)
                    ? "bundle.zip" : metadata.FileName;
                var packageFilePath = Path.Combine(networkPath, packageFileName);

                if (!File.Exists(packageFilePath))
                {
                    return BundleScanResult.Failed(
                        $"Package file '{packageFileName}' referenced in metadata not found at '{networkPath}'.");
                }

                var fileInfo = new FileInfo(packageFilePath);
                var fileSize = fileInfo.Length;

                if (fileSize == 0)
                {
                    return BundleScanResult.Failed(
                        $"Package file '{packageFileName}' is empty (0 bytes).");
                }

                // Validate zip integrity
                if (packageFileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        using var stream = File.OpenRead(packageFilePath);
                        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
                        if (archive.Entries.Count == 0)
                        {
                            return BundleScanResult.Failed(
                                $"Package file '{packageFileName}' is an empty zip archive.");
                        }
                    }
                    catch (InvalidDataException)
                    {
                        return BundleScanResult.Failed(
                            $"Package file '{packageFileName}' is corrupted or not a valid zip archive.");
                    }
                    catch (Exception ex)
                    {
                        return BundleScanResult.Failed(
                            $"Could not open package file '{packageFileName}' for validation: {ex.Message}");
                    }
                }

                // Compute SHA-256 hash (web server computes it, not the build team)
                string fileHash;
                try
                {
                    fileHash = await ComputeSHA256Async(packageFilePath, ct);
                    _logger.LogInformation(
                        "Computed hash for {Package}: {Hash}", packageFileName, fileHash);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to compute hash for {Package}", packageFileName);
                    return BundleScanResult.Failed($"Failed to compute file hash: {ex.Message}");
                }

                _logger.LogInformation(
                    "Successfully scanned Bundle release: v{Version}, package: {Package}, size: {Size}",
                    metadata.Version, packageFileName, fileSize);

                return new BundleScanResult
                {
                    Success = true,
                    Version = metadata.Version,
                    PackageName = packageFileName,
                    ReleaseNotes = metadata.ReleaseNotes,
                    BuildDate = metadata.BuildDate,
                    VerifiedBy = metadata.VerifiedBy,
                    FileSizeBytes = fileSize,
                    FileHash = fileHash
                };
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse metadata JSON at {Path}", metadataFilePath);
                return BundleScanResult.Failed($"Metadata parse error: {ex.Message}");
            }
            catch (IOException ex)
            {
                _logger.LogError(ex, "IO error reading metadata at {Path}", metadataFilePath);
                return BundleScanResult.Failed($"Failed to read metadata file: {ex.Message}");
            }
        }

        public async Task<BundleRegisterResult> RegisterAsync(
            BundleRegisterRequest request, CancellationToken ct = default)
        {
            var existing = await _context.UpdatePackages
                .AnyAsync(p => p.PackageType == "Bundle"
                            && p.Version == request.Version
                            && p.IsActive, ct);

            if (existing)
            {
                return BundleRegisterResult.Failed(
                    $"Bundle v{request.Version} is already registered in the Software Library.");
            }

            var package = new UpdatePackage
            {
                PackageType = "Bundle",
                Version = request.Version,
                FileName = string.IsNullOrWhiteSpace(request.FileName) ? "bundle.zip" : request.FileName,
                StoragePath = request.NetworkPath.TrimEnd('\\', '/'),
                FileSize = request.FileSizeBytes ?? 0,
                FileHash = request.FileHash ?? "N/A",
                Description = request.ReleaseNotes,
                UploadedBy = request.RegisteredBy,
                UploadedDate = DateTime.UtcNow,
                IsActive = true,
                ShareUsername = request.ShareUsername,
                SharePasswordEncrypted = !string.IsNullOrEmpty(request.SharePassword)
                    ? _encryption.Encrypt(request.SharePassword)
                    : null
            };

            _context.UpdatePackages.Add(package);
            await _context.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Registered Bundle v{Version} as UpdatePackage {Id} in Software Library",
                package.Version, package.UpdatePackageId);

            return new BundleRegisterResult
            {
                Success = true,
                PackageId = package.UpdatePackageId
            };
        }

        /// <summary>
        /// Compute SHA-256 hash of a file. The consumer (web server) computes the hash,
        /// not the build team — this ensures integrity verification end-to-end.
        /// </summary>
        private static async Task<string> ComputeSHA256Async(string filePath, CancellationToken ct)
        {
            using var sha256 = SHA256.Create();
            using var stream = File.OpenRead(filePath);
            var hashBytes = await sha256.ComputeHashAsync(stream, ct);
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }

        private class BundleReleaseMetadata
        {
            public string Version { get; set; } = string.Empty;
            public string? FileName { get; set; }
            public string? ReleaseNotes { get; set; }
            public string? BuildDate { get; set; }
            public string? VerifiedBy { get; set; }
        }
    }
}
