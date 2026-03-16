using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Services
{

    public interface ILAIService
    {

        Task<LAIScanResult> ScanReleaseAsync(string networkPath, CancellationToken ct = default);

        Task<LAIRegisterResult> RegisterAsync(
            LAIRegisterRequest request, CancellationToken ct = default);
    }

    


    public class LAIScanResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }

        
        public string? Version { get; init; }
        public string? PackageName { get; init; }
        public string? ReleaseNotes { get; init; }
        public string? BuildDate { get; init; }
        public string? VerifiedBy { get; init; }
        public long? FileSizeBytes { get; init; }

        public static LAIScanResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }

    public class LAIRegisterRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string PackageName { get; set; } = string.Empty;
        public string? ReleaseNotes { get; set; }
        public string RegisteredBy { get; set; } = "System";
    }

    public class LAIRegisterResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }
        public int? PackageId { get; init; }

        public static LAIRegisterResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }
}
