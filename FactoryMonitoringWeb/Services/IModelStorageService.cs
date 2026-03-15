namespace FactoryMonitoringWeb.Services
{

    public interface IModelStorageService
    {

        Task<string> SaveModelAsync(Stream fileStream, int modelFileId, int version);

        Task<Stream?> GetModelStreamAsync(string storagePath);

        Task<bool> DeleteModelAsync(string storagePath);

        string GetFullPath(string storagePath);

        Task<string> ComputeChecksumAsync(string filePath);
    }
}

