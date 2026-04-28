using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Data.Repositories
{

    public interface ILensAssemblyMCRepository : IRepository<LensAssemblyMC>
    {

        Task<LensAssemblyMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default);

        Task<LensAssemblyMC?> FindByIpAsync(
            string ipAddress,
            CancellationToken cancellationToken = default);

        Task<IEnumerable<LensAssemblyMC>> GetOnlineMCsAsync(CancellationToken cancellationToken = default);

        Task<IEnumerable<LensAssemblyMC>> GetMCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default);

        Task<int> MarkMCsOfflineAsync(
            IEnumerable<int> mcIds,
            CancellationToken cancellationToken = default);

        Task<LensAssemblyMC?> GetByIdWithRelatedAsync(
            int mcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default);
    }
}

