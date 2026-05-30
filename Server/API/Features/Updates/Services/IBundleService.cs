using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;

namespace LensAssemblyMonitoringWeb.Features.Updates.Services
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

    /// <summary>
    /// Payload required to register a scanned Software Bundle package into the system library.
    /// </summary>
    public class BundleRegisterRequest
    {
        /// <summary>
        /// Remote network share directory path where update bundle resides.
        /// </summary>
        /// <example>\\10.250.200.10\releases\bundle-v1.2.5</example>
        public string NetworkPath { get; set; } = string.Empty;

        /// <summary>
        /// Package version parsed during the scan.
        /// </summary>
        /// <example>1.2.5</example>
        public string Version { get; set; } = string.Empty;

        /// <summary>
        /// Name of the main bundle installer file (e.g. FMS_Bundle_1.2.5.zip).
        /// </summary>
        /// <example>FMS_Bundle_1.2.5.zip</example>
        public string? FileName { get; set; }

        /// <summary>
        /// Optional description or release notes of features and bugs addressed.
        /// </summary>
        /// <example>Includes high-concurrency log parsing upgrades</example>
        public string? ReleaseNotes { get; set; }

        /// <summary>
        /// Total file size of the package on disk.
        /// </summary>
        /// <example>104857600</example>
        public long? FileSizeBytes { get; set; }

        /// <summary>
        /// SHA-256 validation hash computed during scan.
        /// </summary>
        /// <example>a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2</example>
        public string? FileHash { get; set; }

        /// <summary>
        /// User or subsystem context that requested the catalog entry.
        /// </summary>
        /// <example>Operator</example>
        public string RegisteredBy { get; set; } = "System";

        /// <summary>
        /// Optional credentials username to access the network share.
        /// </summary>
        /// <example>release_user</example>
        public string? ShareUsername { get; set; }

        /// <summary>
        /// Optional credentials password to access the network share.
        /// </summary>
        /// <example>s3cr3tP@ss</example>
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


