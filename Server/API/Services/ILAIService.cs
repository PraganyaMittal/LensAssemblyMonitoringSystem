using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Services
{

    public interface ILAIService
    {

        Task<LAIScanResult> ScanReleaseAsync(string networkPath, string? username = null, string? password = null, CancellationToken ct = default);

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
        public string? FileHash { get; init; }

        public static LAIScanResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }

    /// <summary>
    /// Payload required to register a scanned Lens Assembly Installer (LAI) package into the system.
    /// </summary>
    public class LAIRegisterRequest
    {
        /// <summary>
        /// Remote network share directory path where update LAI resides.
        /// </summary>
        /// <example>\\10.250.200.10\releases\lai-v2.1.0</example>
        public string NetworkPath { get; set; } = string.Empty;

        /// <summary>
        /// LAI version parsed during scan.
        /// </summary>
        /// <example>2.1.0</example>
        public string Version { get; set; } = string.Empty;

        /// <summary>
        /// Name of the main LAI installer file (e.g. LAI_Setup_2.1.0.exe).
        /// </summary>
        /// <example>LAI_Setup_2.1.0.exe</example>
        public string? FileName { get; set; }

        /// <summary>
        /// Optional description or release notes of features and bugs addressed.
        /// </summary>
        /// <example>C++ agent daemon stability fixes</example>
        public string? ReleaseNotes { get; set; }

        /// <summary>
        /// SHA-256 validation hash computed during scan.
        /// </summary>
        /// <example>f6e5d4c3b2a1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7</example>
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
