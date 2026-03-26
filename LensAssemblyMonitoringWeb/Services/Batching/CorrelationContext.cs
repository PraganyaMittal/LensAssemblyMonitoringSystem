using System.Threading;

namespace LensAssemblyMonitoringWeb.Services.Batching
{

    public static class CorrelationContext
    {
        private static readonly AsyncLocal<string?> _correlationId = new AsyncLocal<string?>();

        public static string? CorrelationId
        {
            get => _correlationId.Value;
            private set => _correlationId.Value = value;
        }

        public static void Set(string correlationId)
        {
            CorrelationId = correlationId;
        }

        public static void Clear()
        {
            CorrelationId = null;
        }

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

        public static string GenerateCorrelationId()
        {
            return Guid.NewGuid().ToString("N")[..16];
        }
    }
}

