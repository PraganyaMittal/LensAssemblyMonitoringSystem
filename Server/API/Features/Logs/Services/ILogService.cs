namespace LensAssemblyMonitoringWeb.Features.Logs.Services
{

    public interface ILogService
    {

        Task<LogContentResult> GetLogContentAsync(
            int MCId,
            string logFilePath,
            CancellationToken cancellationToken = default);

        Task SyncLogStructureAsync(
            int MCId,
            string logStructureJson,
            CancellationToken cancellationToken = default);

        bool CompleteLogRequest(string requestId, CompressedLogContent content);
    }

    public class LogContentResult
    {
        public bool Success { get; init; }
        public bool FromCache { get; init; }
        public string FileName { get; init; } = "";
        public string FilePath { get; init; } = "";
        public string Content { get; init; } = "";
        public long OriginalSize { get; init; }
        public string? ErrorMessage { get; init; }

        public static LogContentResult Succeeded(
            string fileName,
            string filePath,
            string content,
            long size,
            bool fromCache) => new()
        {
            Success = true,
            FromCache = fromCache,
            FileName = fileName,
            FilePath = filePath,
            Content = content,
            OriginalSize = size
        };

        public static LogContentResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }
}



