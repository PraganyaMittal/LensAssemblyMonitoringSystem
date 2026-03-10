using System.IO.Compression;
using System.Security.Cryptography;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Commands.Update
{
    /// <summary>
    /// Handles uploading a new update package (.zip).
    /// 1. Checks for duplicate (PackageType, Version) among active packages
    /// 2. Computes SHA-256 hash
    /// 3. Validates zip contains only valid component folders
    /// 4. Stores file on disk with GUID name
    /// 5. Inserts DB record
    /// </summary>
    public class UploadPackageHandler : ICommandHandler<UploadPackageCommand, UploadPackageResult>
    {
        private readonly FactoryDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UploadPackageHandler> _logger;

        // Valid top-level folder names inside a Bundle zip
        private static readonly HashSet<string> ValidComponentFolders = new(StringComparer.OrdinalIgnoreCase)
        {
            "LAI", "FactoryService", "FactoryAgent", "AutoUpdater"
        };

        public UploadPackageHandler(
            FactoryDbContext context,
            IWebHostEnvironment env,
            ILogger<UploadPackageHandler> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _env = env ?? throw new ArgumentNullException(nameof(env));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<UploadPackageResult> HandleAsync(
            UploadPackageCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
                throw new ArgumentNullException(nameof(command));

            try
            {
                // 1. Check for duplicate active package with same type + version
                var duplicate = await _context.UpdatePackages
                    .AnyAsync(p => p.PackageType == command.PackageType
                               && p.Version == command.Version
                               && p.IsActive,
                        cancellationToken);

                if (duplicate)
                {
                    _logger.LogWarning(
                        "Duplicate package: {Type} v{Version} already exists",
                        command.PackageType, command.Version);
                    return UploadPackageResult.DuplicateVersion(command.PackageType, command.Version);
                }

                // 2. Read file into memory and compute SHA-256
                byte[] fileBytes;
                string fileHash;

                using (var memoryStream = new MemoryStream())
                {
                    await command.File.CopyToAsync(memoryStream, cancellationToken);
                    fileBytes = memoryStream.ToArray();
                }

                using (var sha256 = SHA256.Create())
                {
                    var hashBytes = sha256.ComputeHash(fileBytes);
                    fileHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                }

                // 3. Validate zip contains only valid component folders
                //    Supports both layouts:
                //    a) Component folders at root:   LAI/, FactoryService/, ...
                //    b) Single wrapper folder:       update_v2/LAI/, update_v2/FactoryService/, ...
                var detectedComponents = new List<string>();
                using (var zipStream = new MemoryStream(fileBytes))
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                {
                    // Get unique top-level folder names from zip entries
                    var topLevelFolders = archive.Entries
                        .Select(e => e.FullName.Split('/', '\\').FirstOrDefault())
                        .Where(f => !string.IsNullOrEmpty(f))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    if (!topLevelFolders.Any())
                    {
                        return UploadPackageResult.Failed(
                            "Invalid zip structure: zip must contain component folders (LAI/, FactoryService/, FactoryAgent/, AutoUpdater/)");
                    }

                    // Auto-detect wrapper folder: if there is exactly one top-level entry
                    // and it is NOT a valid component name, look one level deeper.
                    var foldersToValidate = topLevelFolders;
                    if (topLevelFolders.Count == 1 && !ValidComponentFolders.Contains(topLevelFolders[0]))
                    {
                        var wrapperName = topLevelFolders[0];
                        _logger.LogInformation(
                            "Detected wrapper folder '{Wrapper}' in zip — looking one level deeper for components",
                            wrapperName);

                        foldersToValidate = archive.Entries
                            .Select(e => e.FullName.Split('/', '\\'))
                            .Where(parts => parts.Length >= 2
                                && parts[0].Equals(wrapperName, StringComparison.OrdinalIgnoreCase))
                            .Select(parts => parts[1])
                            .Where(f => !string.IsNullOrEmpty(f))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList();

                        if (!foldersToValidate.Any())
                        {
                            return UploadPackageResult.Failed(
                                "Invalid zip structure: zip must contain component folders (LAI/, FactoryService/, FactoryAgent/, AutoUpdater/)");
                        }
                    }

                    var invalidFolders = foldersToValidate
                        .Where(f => !ValidComponentFolders.Contains(f))
                        .ToList();

                    if (invalidFolders.Any())
                    {
                        return UploadPackageResult.Failed(
                            $"Invalid folders in zip: {string.Join(", ", invalidFolders)}. " +
                            $"Allowed: {string.Join(", ", ValidComponentFolders)}");
                    }

                    detectedComponents = foldersToValidate
                        .Where(f => ValidComponentFolders.Contains(f))
                        .ToList();
                }

                _logger.LogInformation(
                    "Bundle contains components: {Components}",
                    string.Join(", ", detectedComponents));


                // 4. Store file on disk with GUID name
                var uploadsDir = Path.Combine(_env.WebRootPath, "uploads", "packages");
                Directory.CreateDirectory(uploadsDir);

                var guidFileName = $"{Guid.NewGuid()}.zip";
                var storagePath = Path.Combine("uploads", "packages", guidFileName);
                var fullPath = Path.Combine(_env.WebRootPath, storagePath);

                await System.IO.File.WriteAllBytesAsync(fullPath, fileBytes, cancellationToken);

                _logger.LogInformation(
                    "Package file saved: {StoragePath} ({Size} bytes, SHA256: {Hash})",
                    storagePath, fileBytes.Length, fileHash);

                // 5. Insert DB record
                var package = new UpdatePackage
                {
                    PackageName = command.PackageName,
                    PackageType = command.PackageType,
                    Version = command.Version,
                    FileName = command.File.FileName,
                    StoragePath = storagePath,
                    FileSize = fileBytes.Length,
                    FileHash = fileHash,
                    Description = command.Description,
                    UploadedBy = command.UploadedBy,
                    UploadedDate = DateTime.UtcNow,
                    IsActive = true
                };

                // Append detected component names to description
                if (detectedComponents.Any())
                {
                    var componentInfo = $"[Components: {string.Join(", ", detectedComponents)}]";
                    package.Description = string.IsNullOrWhiteSpace(command.Description)
                        ? componentInfo
                        : $"{command.Description}\n{componentInfo}";
                }

                _context.UpdatePackages.Add(package);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Package uploaded: Id={Id}, {Type} v{Version} by {User}",
                    package.UpdatePackageId, command.PackageType, command.Version, command.UploadedBy);

                return UploadPackageResult.Succeeded(package.UpdatePackageId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload package {Type} v{Version}",
                    command.PackageType, command.Version);
                return UploadPackageResult.Failed($"Upload failed: {ex.Message}");
            }
        }
    }
}
