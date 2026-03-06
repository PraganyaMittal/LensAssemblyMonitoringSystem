namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Handles storage of model binary files on disk (or another storage backend).
    /// The database only stores metadata — this service manages the actual files.
    /// </summary>
    public interface IModelStorageService
    {
        /// <summary>
        /// Saves a model file to disk storage.
        /// </summary>
        /// <param name="fileStream">The file content stream</param>
        /// <param name="modelFileId">The model file ID (used in path generation)</param>
        /// <param name="version">Version number (used in path generation)</param>
        /// <returns>Relative storage path, e.g. "models/42/v1.zip"</returns>
        Task<string> SaveModelAsync(Stream fileStream, int modelFileId, int version);

        /// <summary>
        /// Gets a readable stream for a stored model file.
        /// </summary>
        /// <param name="storagePath">Relative path returned by SaveModelAsync</param>
        /// <returns>File stream, or null if file doesn't exist</returns>
        Task<Stream?> GetModelStreamAsync(string storagePath);

        /// <summary>
        /// Deletes a model file from disk storage.
        /// </summary>
        /// <param name="storagePath">Relative path to delete</param>
        /// <returns>True if deleted, false if file didn't exist</returns>
        Task<bool> DeleteModelAsync(string storagePath);

        /// <summary>
        /// Gets the full absolute path to a stored model file.
        /// </summary>
        /// <param name="storagePath">Relative storage path</param>
        /// <returns>Absolute file path</returns>
        string GetFullPath(string storagePath);

        /// <summary>
        /// Computes SHA-256 checksum of a file.
        /// </summary>
        /// <param name="filePath">Absolute path to the file</param>
        /// <returns>SHA-256 hex string (lowercase, 64 chars)</returns>
        Task<string> ComputeChecksumAsync(string filePath);
    }
}
