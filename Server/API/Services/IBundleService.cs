using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Services
{
    /// <summary>
    /// Scans and registers Bundle packages from shared network paths.
    /// Mirrors ILAIService pattern — bundles now come from shared paths, not uploads.
    /// </summary>
    public interface IBundleService
    {
        Task<BundleScanResult> ScanReleaseAsync(string networkPath, string? username = null, string? password = null, CancellationToken ct = default);
        Task<BundleRegisterResult> RegisterAsync(BundleRegisterRequest request, CancellationToken ct = default);
    }

    public class BundleScanResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }

        public string? Version { get; init; }
        public string? PackageName { get; init; }
        public string? ReleaseNotes { get; init; }
        public string? BuildDate { get; init; }
        public string? VerifiedBy { get; init; }
        public long? FileSizeBytes { get; init; }
        public string? FileHash { get; init; }

        public static BundleScanResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }

    public class BundleRegisterRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string? FileName { get; set; }
        public string? ReleaseNotes { get; set; }
        public long? FileSizeBytes { get; set; }
        public string? FileHash { get; set; }
        public string RegisteredBy { get; set; } = "System";
        public string? ShareUsername { get; set; }
        public string? SharePassword { get; set; }
    }

    public class BundleRegisterResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }
        public int? PackageId { get; init; }

        public static BundleRegisterResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }
}
