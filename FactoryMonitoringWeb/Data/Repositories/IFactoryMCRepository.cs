using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Data.Repositories
{

    public interface IFactoryMCRepository : IRepository<FactoryMC>
    {

        Task<FactoryMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default);

        Task<FactoryMC?> FindByIpAsync(
            string ipAddress,
            CancellationToken cancellationToken = default);

        Task<IEnumerable<FactoryMC>> GetOnlineMCsAsync(CancellationToken cancellationToken = default);

        Task<IEnumerable<FactoryMC>> GetMCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default);

        Task<int> MarkMCsOfflineAsync(
            IEnumerable<int> mcIds,
            CancellationToken cancellationToken = default);

        Task<FactoryMC?> GetByIdWithRelatedAsync(
            int mcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default);
    }
}

