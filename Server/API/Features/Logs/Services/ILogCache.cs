namespace LensAssemblyMonitoringWeb.Features.Logs.Services
{

    public interface ILogCache
    {

        CompressedLogContent? Get(string key);

        void Set(string key, CompressedLogContent content);

        bool Remove(string key);

        string GenerateKey(int MCId, string logFilePath);
    }

    public class CompressedLogContent
    {

        public string FileName { get; set; } = "";

        public byte[] CompressedData { get; set; } = Array.Empty<byte>();

        public long CompressedSize { get; set; }

        public long OriginalSize { get; set; }

        public DateTime CachedAt { get; set; } = DateTime.UtcNow;
    }
}



