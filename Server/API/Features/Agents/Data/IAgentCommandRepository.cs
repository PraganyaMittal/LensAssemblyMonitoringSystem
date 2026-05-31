using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;

namespace LensAssemblyMonitoringWeb.Features.Agents.Data
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

        /// <summary>
        /// Deletes commands in a terminal state (Completed, Failed) that are older than the cutoff date.
        /// Pending and Delivered commands are never deleted.
        /// </summary>
        Task<int> DeleteOldCommandsAsync(DateTime cutoffDate, CancellationToken cancellationToken = default);
    }
}




