namespace LensAssemblyMonitoringWeb.Services
{

    public interface IModelValidationService
    {

        Task<ModelValidationResult> ValidateZipAsync(string filePath);
    }

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

