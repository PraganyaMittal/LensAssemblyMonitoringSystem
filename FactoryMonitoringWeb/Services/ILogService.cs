namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Service interface for log operations.
    /// 
    /// Design Decision: Separates log concerns:
    /// 1. GetLogContentAsync - fetches log content (uses cache + agent)
    /// 2. SyncLogStructureAsync - updates log directory tree
    /// 
    /// Request Deduplication: When 50 users request same log file,
    /// only one request goes to the agent. All 50 await the same task.
    /// </summary>
    public interface ILogService
    {
        /// <summary>
        /// Gets log file content, either from cache or by requesting from agent.
        /// Handles request deduplication for concurrent requests.
        /// </summary>
        /// <param name="MCId">PC ID to fetch from</param>
        /// <param name="logFilePath">Full path to log file on agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Decompressed log content</returns>
        Task<LogContentResult> GetLogContentAsync(
            int MCId,
            string logFilePath,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Syncs log structure (directory tree) from agent to database.
        /// </summary>
        /// <param name="MCId">PC ID</param>
        /// <param name="logStructureJson">JSON representation of log directory tree</param>
        /// <param name="cancellationToken">Cancellation token</param>
        Task SyncLogStructureAsync(
            int MCId,
            string logStructureJson,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Called by agent upload endpoint to complete a pending log request.
        /// </summary>
        /// <param name="requestId">The request ID that was sent to agent</param>
        /// <param name="content">Compressed log content from agent</param>
        /// <returns>True if request was pending, false otherwise</returns>
        bool CompleteLogRequest(string requestId, CompressedLogContent content);

        /// <summary>
        /// Gets current cache statistics.
        /// </summary>
        CacheStats GetCacheStats();
    }

    /// <summary>
    /// Result of log content retrieval.
    /// </summary>
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
