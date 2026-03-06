using System.Security.Cryptography;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Stores model files on the local file system.
    /// Files are organized as: {StorageRoot}/models/{modelFileId}/v{version}.zip
    /// 
    /// To switch to Azure Blob Storage or S3 later,
    /// implement IModelStorageService with the cloud SDK instead.
    /// </summary>
    public class FileSystemModelStorageService : IModelStorageService
    {
        private readonly string _storageRoot;
        private readonly ILogger<FileSystemModelStorageService> _logger;

        public FileSystemModelStorageService(
            IConfiguration configuration,
            ILogger<FileSystemModelStorageService> logger)
        {
            _storageRoot = configuration["ModelStorage:StorageRoot"]
                ?? Path.Combine(AppContext.BaseDirectory, "ModelStorage");
            _logger = logger;

            // Ensure storage root exists
            Directory.CreateDirectory(_storageRoot);
            _logger.LogInformation("Model storage root: {StorageRoot}", _storageRoot);
        }

        /// <inheritdoc/>
        public async Task<string> SaveModelAsync(Stream fileStream, int modelFileId, int version)
        {
            var relativePath = $"models/{modelFileId}/v{version}.zip";
            var fullPath = Path.Combine(_storageRoot, relativePath);

            // Ensure parent directory exists
            var directory = Path.GetDirectoryName(fullPath)!;
            Directory.CreateDirectory(directory);

            using (var output = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await fileStream.CopyToAsync(output);
            }

            _logger.LogInformation(
                "Model saved: ModelFileId={ModelFileId}, Version={Version}, Path={Path}, Size={Size}",
                modelFileId, version, relativePath, new FileInfo(fullPath).Length);

            return relativePath;
        }

        /// <inheritdoc/>
        public Task<Stream?> GetModelStreamAsync(string storagePath)
        {
            var fullPath = GetFullPath(storagePath);

            if (!File.Exists(fullPath))
            {
                _logger.LogWarning("Model file not found at: {Path}", fullPath);
                return Task.FromResult<Stream?>(null);
            }

            Stream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            return Task.FromResult<Stream?>(stream);
        }

        /// <inheritdoc/>
        public Task<bool> DeleteModelAsync(string storagePath)
        {
            var fullPath = GetFullPath(storagePath);

            if (!File.Exists(fullPath))
            {
                _logger.LogWarning("Attempted to delete non-existent model file: {Path}", fullPath);
                return Task.FromResult(false);
            }

            File.Delete(fullPath);
            _logger.LogInformation("Model file deleted: {Path}", fullPath);

            // Clean up empty parent directory
            var directory = Path.GetDirectoryName(fullPath)!;
            if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
            {
                Directory.Delete(directory);
                _logger.LogDebug("Empty directory removed: {Dir}", directory);
            }

            return Task.FromResult(true);
        }

        /// <inheritdoc/>
        public string GetFullPath(string storagePath)
        {
            // Prevent path traversal attacks
            var normalized = storagePath.Replace('/', Path.DirectorySeparatorChar);
            if (normalized.Contains(".."))
            {
                throw new ArgumentException("Storage path must not contain '..'", nameof(storagePath));
            }
            return Path.Combine(_storageRoot, normalized);
        }

        /// <inheritdoc/>
        public async Task<string> ComputeChecksumAsync(string filePath)
        {
            using var sha256 = SHA256.Create();
            using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);

            var hashBytes = await sha256.ComputeHashAsync(stream);
            return Convert.ToHexString(hashBytes).ToLowerInvariant();
        }
    }
}
