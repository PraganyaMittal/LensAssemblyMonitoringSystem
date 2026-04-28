using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Data.Repositories
{

    public interface IAgentCommandRepository : IRepository<AgentCommand>
    {

        Task<IList<AgentCommand>> GetPendingCommandsAsync(
            int MCId,
            IEnumerable<string>? excludedCommandTypes = null,
            CancellationToken cancellationToken = default);

        Task<int> MarkCommandsInProgressAsync(
            IEnumerable<int> commandIds,
            CancellationToken cancellationToken = default);

        Task<AgentCommand?> GetByIdWithMCAsync(
            int commandId,
            CancellationToken cancellationToken = default);

        Task<bool> UpdateCommandResultAsync(
            int commandId,
            string status,
            string? resultData,
            string? errorMessage,
            CancellationToken cancellationToken = default);
    }
}

