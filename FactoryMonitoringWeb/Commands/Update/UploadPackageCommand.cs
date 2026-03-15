using Microsoft.AspNetCore.Http;

namespace FactoryMonitoringWeb.Commands.Update
{

    public class UploadPackageCommand : ICommand<UploadPackageResult>
    {
        public IFormFile File { get; }
        public string PackageName { get; }
        public string PackageType { get; }
        public string Version { get; }
        public string? Description { get; }
        public string UploadedBy { get; }

        public UploadPackageCommand(
            IFormFile file,
            string packageName,
            string packageType,
            string version,
            string? description,
            string uploadedBy)
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("File is required and cannot be empty", nameof(file));

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext != ".zip")
                throw new ArgumentException("Only .zip files are allowed", nameof(file));

            if (string.IsNullOrWhiteSpace(packageName))
                throw new ArgumentNullException(nameof(packageName));

            if (packageType != "Bundle")
                throw new ArgumentException("PackageType must be 'Bundle'", nameof(packageType));

            if (string.IsNullOrWhiteSpace(version))
                throw new ArgumentNullException(nameof(version));

            if (string.IsNullOrWhiteSpace(uploadedBy))
                throw new ArgumentNullException(nameof(uploadedBy));

            File = file;
            PackageName = packageName;
            PackageType = packageType;
            Version = version;
            Description = description;
            UploadedBy = uploadedBy;
        }
    }

    public class UploadPackageResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public int? PackageId { get; init; }

        public static UploadPackageResult Succeeded(int packageId) => new()
        {
            Success = true,
            Message = "Package uploaded successfully",
            PackageId = packageId
        };

        public static UploadPackageResult DuplicateVersion(string packageType, string version) => new()
        {
            Success = false,
            Message = $"Version {version} already exists for {packageType}"
        };

        public static UploadPackageResult Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}

