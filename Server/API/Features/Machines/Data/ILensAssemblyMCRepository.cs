using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;

namespace LensAssemblyMonitoringWeb.Features.Machines.Data
{

    public interface ILensAssemblyMCRepository : IRepository<LensAssemblyMC>
    {

        Task<LensAssemblyMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? generationNo,
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




