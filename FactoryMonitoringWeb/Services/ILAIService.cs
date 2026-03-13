using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Service interface for LAI release management.
    /// Handles scanning metadata from shared network paths and registering
    /// LAI releases for deployment to factory lines.
    /// </summary>
    public interface ILAIService
    {
        /// <summary>
        /// Scans a shared network path for LAI release metadata (release-info.json).
        /// Does NOT copy the binary — only reads and validates the metadata file.
        /// </summary>
        /// <param name="networkPath">UNC path to the release folder, e.g. \\VERIFY-PC\LAI-Releases\v5.0.0\</param>
        /// <param name="ct">Cancellation token</param>
        /// <returns>Parsed metadata from release-info.json</returns>
        Task<LAIScanResult> ScanReleaseAsync(string networkPath, CancellationToken ct = default);

        /// <summary>
        /// Registers a scanned LAI release in the database and creates DeployLAI
        /// agent commands for all machines on the target line.
        /// </summary>
        Task<LAIRegisterResult> RegisterAndDeployAsync(
            LAIRegisterRequest request, CancellationToken ct = default);

        /// <summary>
        /// Gets the history of LAI releases for a specific line.
        /// </summary>
        Task<IList<LAIRelease>> GetReleasesForLineAsync(
            int lineNumber, CancellationToken ct = default);
    }

    // ────────────────────────────────────────────────────────────────
    // DTOs
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Result of scanning a shared network path for LAI release metadata.
    /// </summary>
    public class LAIScanResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }

        // Parsed from release-info.json
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

    /// <summary>
    /// Request to register and deploy a scanned LAI release.
    /// </summary>
    public class LAIRegisterRequest
    {
        public string NetworkPath { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string PackageName { get; set; } = string.Empty;
        public string? ReleaseNotes { get; set; }
        public int TargetLineNumber { get; set; }
        public string RegisteredBy { get; set; } = "System";
    }

    /// <summary>
    /// Result of registering a LAI release.
    /// </summary>
    public class LAIRegisterResult
    {
        public bool Success { get; init; }
        public string? ErrorMessage { get; init; }
        public int? LAIReleaseId { get; init; }
        public int TargetMCCount { get; init; }

        public static LAIRegisterResult Failed(string error) => new()
        {
            Success = false,
            ErrorMessage = error
        };
    }
}
