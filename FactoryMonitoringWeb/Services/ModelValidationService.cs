using System.IO.Compression;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Validates model zip files before they are accepted into the library.
    /// Catches corrupted zips and zip bombs.
    /// </summary>
    public class ModelValidationService : IModelValidationService
    {
        private readonly ILogger<ModelValidationService> _logger;

        /// <summary>
        /// Maximum total uncompressed size allowed (2 GB by default).
        /// Set to 0 to disable the size check.
        /// </summary>
        private readonly long _maxUncompressedSize;

        public ModelValidationService(
            IConfiguration configuration,
            ILogger<ModelValidationService> logger)
        {
            _logger = logger;

            // Default 2GB, configurable via appsettings
            var maxSizeMb = configuration.GetValue<long>("ModelStorage:MaxUncompressedSizeMB", 2048);
            _maxUncompressedSize = maxSizeMb * 1024 * 1024;
        }

        /// <inheritdoc/>
        public Task<ModelValidationResult> ValidateZipAsync(string filePath)
        {
            if (!File.Exists(filePath))
            {
                return Task.FromResult(ModelValidationResult.Failure("File does not exist."));
            }

            try
            {
                using var archive = ZipFile.OpenRead(filePath);

                int entryCount = archive.Entries.Count;
                if (entryCount == 0)
                {
                    return Task.FromResult(ModelValidationResult.Failure("Zip file is empty."));
                }

                // Check for zip bomb: sum of uncompressed sizes
                long totalUncompressedSize = 0;
                foreach (var entry in archive.Entries)
                {
                    totalUncompressedSize += entry.Length;

                    // Check for path traversal in zip entries
                    if (entry.FullName.Contains(".."))
                    {
                        _logger.LogWarning(
                            "Zip entry contains path traversal: {Entry} in {File}",
                            entry.FullName, filePath);
                        return Task.FromResult(
                            ModelValidationResult.Failure("Zip contains unsafe path traversal entries."));
                    }

                    // Early exit if exceeds max size
                    if (_maxUncompressedSize > 0 && totalUncompressedSize > _maxUncompressedSize)
                    {
                        _logger.LogWarning(
                            "Zip exceeds max uncompressed size: {Size} > {Max} in {File}",
                            totalUncompressedSize, _maxUncompressedSize, filePath);
                        return Task.FromResult(
                            ModelValidationResult.Failure(
                                $"Total uncompressed size exceeds limit of {_maxUncompressedSize / (1024 * 1024)} MB."));
                    }
                }

                _logger.LogDebug(
                    "Zip validated: {File}, entries={Count}, uncompressedSize={Size}",
                    filePath, entryCount, totalUncompressedSize);

                return Task.FromResult(ModelValidationResult.Success(entryCount, totalUncompressedSize));
            }
            catch (InvalidDataException ex)
            {
                _logger.LogWarning(ex, "Corrupted zip file: {File}", filePath);
                return Task.FromResult(
                    ModelValidationResult.Failure("Corrupted zip file. The file could not be read as a valid zip archive."));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error validating zip: {File}", filePath);
                return Task.FromResult(
                    ModelValidationResult.Failure($"Validation error: {ex.Message}"));
            }
        }
    }
}
