namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Validates model files before they are accepted into the library.
    /// </summary>
    public interface IModelValidationService
    {
        /// <summary>
        /// Validates that a zip file is not corrupted and has a valid structure.
        /// </summary>
        /// <param name="filePath">Absolute path to the zip file to validate</param>
        /// <returns>Validation result</returns>
        Task<ModelValidationResult> ValidateZipAsync(string filePath);
    }

    /// <summary>
    /// Result of model validation.
    /// </summary>
    public class ModelValidationResult
    {
        public bool IsValid { get; init; }
        public string? ErrorMessage { get; init; }
        public int EntryCount { get; init; }
        public long TotalUncompressedSize { get; init; }

        public static ModelValidationResult Success(int entryCount, long totalSize) => new()
        {
            IsValid = true,
            EntryCount = entryCount,
            TotalUncompressedSize = totalSize
        };

        public static ModelValidationResult Failure(string error) => new()
        {
            IsValid = false,
            ErrorMessage = error
        };
    }
}
