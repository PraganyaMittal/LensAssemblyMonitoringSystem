using System.IO.Compression;
using System.Security.Cryptography;
using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Commands.Update
{

    public class UploadPackageHandler : ICommandHandler<UploadPackageCommand, UploadPackageResult>
    {
        private readonly LensAssemblyDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UploadPackageHandler> _logger;

        private static readonly HashSet<string> ValidComponentFolders = new(StringComparer.OrdinalIgnoreCase)
        {
            "LAI", "LensAssemblyService", "LensAssemblyAgent", "AutoUpdater"
        };

        public UploadPackageHandler(
            LensAssemblyDbContext context,
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

                var detectedComponents = new List<string>();
                using (var zipStream = new MemoryStream(fileBytes))
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                {
                    
                    var topLevelFolders = archive.Entries
                        .Select(e => e.FullName.Split('/', '\\').FirstOrDefault())
                        .Where(f => !string.IsNullOrEmpty(f))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    if (!topLevelFolders.Any())
                    {
                        return UploadPackageResult.Failed(
                            "Invalid zip structure: zip must contain component folders (LAI/, LensAssemblyService/, LensAssemblyAgent/, AutoUpdater/)");
                    }

                    var foldersToValidate = topLevelFolders;
                    if (topLevelFolders.Count == 1 && !ValidComponentFolders.Contains(topLevelFolders[0]))
                    {
                        var wrapperName = topLevelFolders[0];
                        _logger.LogInformation(
                            "Detected wrapper folder '{Wrapper}' in zip â€” looking one level deeper for components",
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
                                "Invalid zip structure: zip must contain component folders (LAI/, LensAssemblyService/, LensAssemblyAgent/, AutoUpdater/)");
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

                var uploadsDir = Path.Combine(_env.WebRootPath, "uploads", "packages");
                Directory.CreateDirectory(uploadsDir);

                var guidFileName = $"{Guid.NewGuid()}.zip";
                var storagePath = Path.Combine("uploads", "packages", guidFileName);
                var fullPath = Path.Combine(_env.WebRootPath, storagePath);

                await System.IO.File.WriteAllBytesAsync(fullPath, fileBytes, cancellationToken);

                _logger.LogInformation(
                    "Package file saved: {StoragePath} ({Size} bytes, SHA256: {Hash})",
                    storagePath, fileBytes.Length, fileHash);

                var package = new UpdatePackage
                {
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

