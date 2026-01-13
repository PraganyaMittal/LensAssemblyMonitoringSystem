using System.Threading;

namespace FactoryMonitoringWeb.Services.Batching
{
    /// <summary>
    /// Thread-safe singleton for correlation ID propagation across async boundaries.
    /// 
    /// Design Decision: Uses AsyncLocal for thread-safe storage that flows across
    /// async/await boundaries. This is critical for:
    /// 1. Logging correlation IDs in background services
    /// 2. Passing correlation IDs to repository operations
    /// 3. Including correlation IDs in exception responses
    /// 
    /// Note: This is NOT a configuration manager (that would use IOptions pattern).
    /// This is specifically for cross-cutting correlation context.
    /// </summary>
    public static class CorrelationContext
    {
        private static readonly AsyncLocal<string?> _correlationId = new AsyncLocal<string?>();

        /// <summary>
        /// Gets the current correlation ID for the executing async context.
        /// Returns null if no correlation ID has been set.
        /// </summary>
        public static string? CorrelationId
        {
            get => _correlationId.Value;
            private set => _correlationId.Value = value;
        }

        /// <summary>
        /// Sets the correlation ID for the current async context.
        /// Typically called by middleware at the start of a request.
        /// </summary>
        /// <param name="correlationId">The correlation ID to set</param>
        public static void Set(string correlationId)
        {
            CorrelationId = correlationId;
        }

        /// <summary>
        /// Clears the correlation ID. Call at the end of request processing.
        /// </summary>
        public static void Clear()
        {
            CorrelationId = null;
        }

        /// <summary>
        /// Gets the current correlation ID or generates a new one if not set.
        /// Useful when correlation ID is required but may not exist.
        /// </summary>
        public static string GetOrGenerate()
        {
            var id = CorrelationId;
            if (string.IsNullOrEmpty(id))
            {
                id = GenerateCorrelationId();
                Set(id);
            }
            return id;
        }

        /// <summary>
        /// Generates a new correlation ID.
        /// Format: 16-character hex string from GUID for brevity in logs.
        /// </summary>
        public static string GenerateCorrelationId()
        {
            return Guid.NewGuid().ToString("N")[..16];
        }
    }
}
